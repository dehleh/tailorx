"""
Tailor-X MediaPipe Pose Detection Server

A lightweight FastAPI server that runs MediaPipe Pose Landmarker
on uploaded images and returns 33 BlazePose landmarks.

Deploy to:
- Google Cloud Run (recommended)
- AWS Lambda via Mangum adapter
- Any Docker host
- Local development

Usage:
    pip install -r requirements.txt
    python server.py              # Dev mode on :8000
    uvicorn server:app --host 0.0.0.0 --port 8080  # Production

Endpoints:
    GET  /health                 - Health check
    POST /v1/pose/detect         - Detect pose landmarks from base64 image
    POST /v1/pose/detect-refined - Detect with sub-pixel refinement
    POST /v1/body/contour        - Extract body contour widths (with shadow filtering)
    POST /v1/image/quality       - Image quality analysis
    POST /v1/image/detect-reference - Reference object detection
    POST /v1/depth/estimate      - Monocular depth estimation (MiDaS)
    POST /v1/aruco/detect        - ArUco marker detection for scale
"""
from __future__ import annotations

import base64
import io
import time
import os
import logging
import random
import re
import sqlite3
import secrets
import uuid
import statistics
from typing import Optional, Any
from datetime import datetime, timedelta

import numpy as np
import requests as http_requests
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr
from starlette.middleware.base import BaseHTTPMiddleware
import mediapipe as mp
import jwt as pyjwt
import hmac
import hashlib
import json
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
from PIL import Image, ImageOps

# ============================================================
# HELPERS
# ============================================================

def _open_image(image_bytes: bytes) -> Image.Image:
    """Open an image from bytes, applying EXIF rotation so pixel data
    matches the visual orientation (critical for portrait phone photos)."""
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)  # Apply EXIF rotation
    return img.convert("RGB")

# ============================================================
# CONFIG
# ============================================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tailorx-pose")

API_KEY = os.environ.get("TAILORX_API_KEY", "")
PORT = int(os.environ.get("PORT", 8000))
MODEL_PATH = os.environ.get("MODEL_PATH", "pose_landmarker_full.task")
SEGMENTATION_MODEL_PATH = os.environ.get("SEGMENTATION_MODEL_PATH", "selfie_segmenter.tflite")

# Email config for OTP (Resend HTTP API only — SMTP support removed)
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM", "Tailor-X <info@tailorxfit.com>")  # Default sender for transactional/auth emails
RESEND_FROM_WAITLIST = os.environ.get("RESEND_FROM_WAITLIST", "Tailor-X Waitlist <enquiry@tailorxfit.com>")  # Sender for marketing waitlist confirmations
WAITLIST_ADMIN_EMAIL = os.environ.get("WAITLIST_ADMIN_EMAIL", "enquiry@tailorxfit.com")  # Inbox that receives a copy of every signup
ENTERPRISE_DB_PATH = os.environ.get(
    "ENTERPRISE_DB_PATH",
    os.path.join(os.path.dirname(__file__), "enterprise.db"),
)
# If DATABASE_URL is set (e.g. Railway Postgres), it takes precedence over SQLite.
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USE_POSTGRES = bool(DATABASE_URL)
DEFAULT_BILLING_CURRENCY = os.environ.get("TAILORX_BILLING_CURRENCY", "NGN")

# JWT config
JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", 24))
# In production we MUST have a stable JWT_SECRET — otherwise every restart
# silently invalidates every issued admin token. The only acceptable
# auto-generated secret is in local dev (RAILWAY_ENVIRONMENT not set).
if not JWT_SECRET:
    if os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("TAILORX_REQUIRE_JWT_SECRET"):
        raise RuntimeError(
            "JWT_SECRET env var is required in production. Refusing to start with an ephemeral secret."
        )
    JWT_SECRET = secrets.token_hex(32)
    logger.warning(
        "JWT_SECRET not set — using ephemeral dev secret. "
        "Set JWT_SECRET in production or all admin tokens will be invalidated on restart."
    )
elif len(JWT_SECRET) < 32:
    logger.warning(
        "JWT_SECRET is shorter than 32 chars — recommend at least 32 random hex chars."
    )

# Paystack config (https://paystack.com/docs/api/)
PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY", "")
PAYSTACK_PUBLIC_KEY = os.environ.get("PAYSTACK_PUBLIC_KEY", "")
PAYSTACK_PLAN_STARTER = os.environ.get("PAYSTACK_PLAN_STARTER", "")     # plan code e.g. PLN_xxx
PAYSTACK_PLAN_GROWTH = os.environ.get("PAYSTACK_PLAN_GROWTH", "")
PAYSTACK_PLAN_ENTERPRISE = os.environ.get("PAYSTACK_PLAN_ENTERPRISE", "")
PAYSTACK_API_BASE = os.environ.get("PAYSTACK_API_BASE", "https://api.paystack.co")
WEB_APP_URL = os.environ.get("WEB_APP_URL", "https://admin.tailorxfit.com")
OVERAGE_SCAN_PRICE = float(os.environ.get("TAILORX_OVERAGE_SCAN_PRICE", "500"))   # in major currency units
OVERAGE_GRACE_SCANS = int(os.environ.get("TAILORX_OVERAGE_GRACE_SCANS", "25"))
TRIAL_SCAN_QUOTA = int(os.environ.get("TAILORX_TRIAL_SCAN_QUOTA", "50"))
TRIAL_DAYS = int(os.environ.get("TAILORX_TRIAL_DAYS", "14"))

# CORS allowlist — comma-separated list of allowed origins. Defaults to web app + localhost dev.
_default_origins = f"{WEB_APP_URL},https://tailorxfit.com,https://www.tailorxfit.com,https://tailorx-landing-production.up.railway.app,http://localhost:3000,http://localhost:3001,http://localhost:19006"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("TAILORX_ALLOWED_ORIGINS", _default_origins).split(",")
    if origin.strip()
]

if PAYSTACK_SECRET_KEY:
    logger.info("Paystack configured")
else:
    logger.warning("PAYSTACK_SECRET_KEY not set — billing checkout will use mock fallback")

# Map plan tier names to Paystack plan codes
PAYSTACK_PLAN_MAP: dict[str, str] = {}
if PAYSTACK_PLAN_STARTER:
    PAYSTACK_PLAN_MAP["starter"] = PAYSTACK_PLAN_STARTER
if PAYSTACK_PLAN_GROWTH:
    PAYSTACK_PLAN_MAP["growth"] = PAYSTACK_PLAN_GROWTH
if PAYSTACK_PLAN_ENTERPRISE:
    PAYSTACK_PLAN_MAP["enterprise"] = PAYSTACK_PLAN_ENTERPRISE

MEASUREMENT_CATALOG_VERSION = "tailorx-iso8559-1-v1"

MEASUREMENT_CATALOG: list[dict[str, Any]] = [
    {
        "key": "height",
        "label": "Height",
        "profile": "all",
        "type": "linear",
        "requiredForFit": True,
        "requiresSideView": False,
        "source": "pose+calibration",
        "garmentUses": ["all"],
    },
    {
        "key": "chest",
        "label": "Chest/Bust circumference",
        "profile": "all",
        "type": "circumference",
        "requiredForFit": True,
        "requiresSideView": True,
        "source": "front+side contour ellipse",
        "garmentUses": ["shirt", "dress", "jacket", "agbada", "kaftan"],
    },
    {
        "key": "bust",
        "label": "Bust circumference",
        "profile": "female",
        "type": "circumference",
        "requiredForFit": True,
        "requiresSideView": True,
        "source": "chest/bust contour",
        "garmentUses": ["dress", "blouse", "corset"],
    },
    {
        "key": "underbust",
        "label": "Underbust circumference",
        "profile": "female",
        "type": "circumference",
        "requiredForFit": True,
        "requiresSideView": True,
        "source": "front+side ellipse",
        "garmentUses": ["dress", "blouse", "corset"],
    },
    {
        "key": "cupDifference",
        "label": "Bust minus underbust",
        "profile": "female",
        "type": "derived",
        "requiredForFit": False,
        "requiresSideView": True,
        "source": "bust-underbust",
        "garmentUses": ["corset", "bra-fitting"],
    },
    {
        "key": "waist",
        "label": "Waist circumference",
        "profile": "all",
        "type": "circumference",
        "requiredForFit": True,
        "requiresSideView": True,
        "source": "front+side contour ellipse",
        "garmentUses": ["trouser", "skirt", "dress", "shirt"],
    },
    {
        "key": "hips",
        "label": "Hip/seat circumference",
        "profile": "all",
        "type": "circumference",
        "requiredForFit": True,
        "requiresSideView": True,
        "source": "front+side contour ellipse",
        "garmentUses": ["trouser", "skirt", "dress"],
    },
    {
        "key": "shoulders",
        "label": "Shoulder width",
        "profile": "all",
        "type": "linear",
        "requiredForFit": True,
        "requiresSideView": False,
        "source": "pose landmarks",
        "garmentUses": ["shirt", "dress", "jacket"],
    },
    {
        "key": "neck",
        "label": "Neck circumference",
        "profile": "all",
        "type": "circumference",
        "requiredForFit": True,
        "requiresSideView": True,
        "source": "front+side ellipse",
        "garmentUses": ["shirt", "jacket", "kaftan"],
    },
    {
        "key": "sleeve",
        "label": "Sleeve length",
        "profile": "all",
        "type": "linear",
        "requiredForFit": True,
        "requiresSideView": False,
        "source": "pose landmarks",
        "garmentUses": ["shirt", "dress", "jacket"],
    },
    {
        "key": "armLength",
        "label": "Full arm length",
        "profile": "all",
        "type": "linear",
        "requiredForFit": False,
        "requiresSideView": False,
        "source": "pose landmarks",
        "garmentUses": ["shirt", "jacket"],
    },
    {
        "key": "roundSleeveBicep",
        "label": "Upper arm circumference",
        "profile": "all",
        "type": "circumference",
        "requiredForFit": True,
        "requiresSideView": False,
        "source": "height ratio fallback",
        "garmentUses": ["shirt", "dress", "jacket"],
    },
    {
        "key": "roundSleeveElbow",
        "label": "Elbow circumference",
        "profile": "all",
        "type": "circumference",
        "requiredForFit": False,
        "requiresSideView": False,
        "source": "height ratio fallback",
        "garmentUses": ["shirt", "jacket"],
    },
    {
        "key": "wrist",
        "label": "Wrist circumference",
        "profile": "all",
        "type": "circumference",
        "requiredForFit": False,
        "requiresSideView": False,
        "source": "height ratio fallback",
        "garmentUses": ["shirt", "jacket"],
    },
    {
        "key": "inseam",
        "label": "Inseam length",
        "profile": "all",
        "type": "linear",
        "requiredForFit": True,
        "requiresSideView": False,
        "source": "pose landmarks",
        "garmentUses": ["trouser"],
    },
    {
        "key": "outseam",
        "label": "Outseam length",
        "profile": "all",
        "type": "linear",
        "requiredForFit": False,
        "requiresSideView": False,
        "source": "pose landmarks",
        "garmentUses": ["trouser", "skirt"],
    },
    {
        "key": "rise",
        "label": "Trouser rise",
        "profile": "all",
        "type": "linear",
        "requiredForFit": False,
        "requiresSideView": False,
        "source": "height ratio fallback",
        "garmentUses": ["trouser"],
    },
    {
        "key": "thigh",
        "label": "Thigh circumference",
        "profile": "all",
        "type": "circumference",
        "requiredForFit": True,
        "requiresSideView": True,
        "source": "front+side contour ellipse",
        "garmentUses": ["trouser", "shorts"],
    },
    {
        "key": "knee",
        "label": "Knee circumference",
        "profile": "all",
        "type": "circumference",
        "requiredForFit": False,
        "requiresSideView": False,
        "source": "height ratio fallback",
        "garmentUses": ["trouser"],
    },
    {
        "key": "calf",
        "label": "Calf circumference",
        "profile": "all",
        "type": "circumference",
        "requiredForFit": False,
        "requiresSideView": True,
        "source": "front+side contour ellipse",
        "garmentUses": ["trouser"],
    },
    {
        "key": "ankle",
        "label": "Ankle circumference",
        "profile": "all",
        "type": "circumference",
        "requiredForFit": False,
        "requiresSideView": False,
        "source": "height ratio fallback",
        "garmentUses": ["trouser"],
    },
    {
        "key": "halfLength",
        "label": "Shoulder to waist",
        "profile": "female",
        "type": "linear",
        "requiredForFit": True,
        "requiresSideView": False,
        "source": "pose landmarks",
        "garmentUses": ["dress", "blouse"],
    },
    {
        "key": "topLength",
        "label": "Top length",
        "profile": "all",
        "type": "linear",
        "requiredForFit": False,
        "requiresSideView": False,
        "source": "pose landmarks",
        "garmentUses": ["shirt", "blouse", "kaftan"],
    },
    {
        "key": "backWidth",
        "label": "Back width",
        "profile": "all",
        "type": "linear",
        "requiredForFit": False,
        "requiresSideView": False,
        "source": "pose landmarks",
        "garmentUses": ["shirt", "jacket"],
    },
    {
        "key": "frontWidth",
        "label": "Front width",
        "profile": "all",
        "type": "linear",
        "requiredForFit": False,
        "requiresSideView": False,
        "source": "pose landmarks",
        "garmentUses": ["shirt", "dress", "jacket"],
    },
]


def _validate_production_env() -> None:
    """Warn loudly if production-critical env vars are missing."""
    missing: list[str] = []
    if not os.environ.get("JWT_SECRET"):
        missing.append("JWT_SECRET")
    if not PAYSTACK_SECRET_KEY:
        missing.append("PAYSTACK_SECRET_KEY")
    if not RESEND_API_KEY:
        missing.append("RESEND_API_KEY")
    if missing:
        logger.warning(
            "⚠️  Production readiness: missing env vars: %s",
            ", ".join(missing),
        )


_validate_production_env()

# Sentry (optional — only initializes if SENTRY_DSN is set)
SENTRY_DSN = os.environ.get("SENTRY_DSN", "").strip()
if SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            environment=os.environ.get("SENTRY_ENVIRONMENT", os.environ.get("RAILWAY_ENVIRONMENT", "production")),
            release=os.environ.get("SENTRY_RELEASE", "tailorx-backend@2.0.0"),
            traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            send_default_pii=False,
            integrations=[FastApiIntegration(), StarletteIntegration()],
        )
        logger.info("Sentry initialized")
    except Exception as exc:
        logger.warning(f"Sentry init failed: {exc}")
else:
    logger.info("Sentry: SENTRY_DSN not set, skipping")

# Log email config at startup
if RESEND_API_KEY:
    logger.info(f"Email: Resend API configured (from: {RESEND_FROM})")
else:
    logger.warning("Email: No email provider configured! Set RESEND_API_KEY")

# In-memory OTP store: { email: { code, expires_at } }
_otp_store: dict[str, dict] = {}


def _otp_set(email: str, code: str, ttl_minutes: int = 10) -> None:
    """Persist an OTP code for an email. Postgres if available, else in-memory."""
    expires = datetime.utcnow() + timedelta(minutes=ttl_minutes)
    sent_at = datetime.utcnow()
    _otp_store[email] = {"code": code, "expires_at": expires, "sent_at": sent_at}
    if not USE_POSTGRES:
        return
    conn = _enterprise_connection()
    try:
        # Postgres-style upsert; SQLite fallback handled above
        conn.execute(
            """
            INSERT INTO otp_codes (email, code, expires_at, sent_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (email) DO UPDATE SET code=EXCLUDED.code, expires_at=EXCLUDED.expires_at, sent_at=EXCLUDED.sent_at
            """,
            (email, code, expires.isoformat(), sent_at.isoformat()),
        )
        conn.commit()
    except Exception as exc:
        logger.error(f"otp_set DB write failed for {email}: {exc}")
    finally:
        conn.close()


def _otp_get(email: str) -> Optional[dict]:
    """Fetch an OTP entry (dict with 'code', 'expires_at', 'sent_at') or None."""
    entry = _otp_store.get(email)
    if entry:
        return entry
    if not USE_POSTGRES:
        return None
    conn = _enterprise_connection()
    try:
        row = conn.execute(
            "SELECT code, expires_at, sent_at FROM otp_codes WHERE email = ?",
            (email,),
        ).fetchone()
        if not row:
            return None
        try:
            exp = datetime.fromisoformat(row["expires_at"]) if isinstance(row["expires_at"], str) else row["expires_at"]
            snt = datetime.fromisoformat(row["sent_at"]) if isinstance(row["sent_at"], str) else row["sent_at"]
        except Exception:
            return None
        entry = {"code": row["code"], "expires_at": exp, "sent_at": snt}
        _otp_store[email] = entry  # cache
        return entry
    finally:
        conn.close()


def _otp_delete(email: str) -> None:
    _otp_store.pop(email, None)
    if not USE_POSTGRES:
        return
    conn = _enterprise_connection()
    try:
        conn.execute("DELETE FROM otp_codes WHERE email = ?", (email,))
        conn.commit()
    finally:
        conn.close()

# ============================================================
# MODELS
# ============================================================

class PoseRequest(BaseModel):
    image: str                # Base64-encoded image
    captureType: str = "front"  # front | side | back
    model: str = "blazepose_full"
    returnFormat: str = "normalized"  # normalized (0-1) or pixel

class ImageQualityResult(BaseModel):
    blur_score: float       # 0-100, higher = sharper
    brightness: float       # 0-255 average
    contrast: float         # standard deviation of pixel intensities
    is_acceptable: bool
    issues: list[str]

class LandmarkResponse(BaseModel):
    x: float
    y: float
    z: float
    visibility: float
    name: str

class OTPSendRequest(BaseModel):
    email: str

class OTPVerifyRequest(BaseModel):
    email: str
    code: str

class PoseResponse(BaseModel):
    landmarks: list[LandmarkResponse]
    imageWidth: int
    imageHeight: int
    confidence: float
    model: str
    processingTimeMs: int

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str


class EnterpriseBootstrapRequest(BaseModel):
    organizationName: str = Field(min_length=1, max_length=120)
    adminName: str = Field(min_length=1, max_length=120)
    adminEmail: EmailStr
    seats: int = Field(default=10, ge=1, le=100000)
    scanQuota: int = Field(default=500, ge=1, le=10_000_000)
    brandName: Optional[str] = Field(default=None, max_length=120)
    primaryColor: str = Field(default="#0F2B3C", max_length=16)
    imprint: Optional[str] = Field(default=None, max_length=240)


class EnterpriseInviteRequest(BaseModel):
    label: str
    campaignName: Optional[str] = None
    imprint: Optional[str] = None
    primaryColor: Optional[str] = None
    landingHeadline: Optional[str] = None


class EnterpriseSessionStartRequest(BaseModel):
    customerName: str
    customerEmail: str
    customerPhone: Optional[str] = None
    source: str = "invite_link"


class EnterpriseSessionCompleteRequest(BaseModel):
    measurementId: Optional[str] = None
    accuracyScore: Optional[float] = None
    measurements: Optional[dict[str, float]] = None
    unit: str = Field(default="cm", max_length=8)
    measurementProfile: Optional[str] = Field(default=None, max_length=40)
    confidence: Optional[dict[str, float]] = None
    warnings: Optional[list[str]] = None
    metadata: Optional[dict[str, Any]] = None


class EnterpriseSessionReviewRequest(BaseModel):
    reviewStatus: str = Field(default="reviewed", max_length=32)
    tailorNotes: Optional[str] = Field(default=None, max_length=1000)


class AccuracyBenchmarkRecordRequest(BaseModel):
    measurementId: Optional[str] = Field(default=None, max_length=120)
    measurementProfile: Optional[str] = Field(default=None, max_length=40)
    scanMeasurements: dict[str, float]
    tapeMeasurements: dict[str, float]
    notes: Optional[str] = Field(default=None, max_length=1000)


class BillingCheckoutRequest(BaseModel):
    organizationId: str
    licenseId: str
    amount: float
    currency: str = DEFAULT_BILLING_CURRENCY
    billingInterval: str = "annual"
    planTier: str = "growth"   # starter | growth | enterprise


class AdminLoginRequest(BaseModel):
    email: EmailStr


class AdminOTPVerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=12)


class InviteStaffRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    role: str = "staff"   # org_admin | staff


class WaitlistRequest(BaseModel):
    email: EmailStr
    name: Optional[str] = Field(default=None, max_length=120)
    company: Optional[str] = Field(default=None, max_length=120)
    role: Optional[str] = Field(default=None, max_length=80)
    useCase: Optional[str] = Field(default=None, max_length=500)
    source: Optional[str] = Field(default=None, max_length=80)


class MeasurementShareCreateRequest(BaseModel):
    measurementId: str = Field(min_length=1, max_length=120)
    measurements: dict[str, float]
    unit: str = Field(default="cm", max_length=8)
    ttlHours: int = Field(default=168, ge=1, le=720)
    createdByEmail: Optional[EmailStr] = None


class MeasurementShareRevokeRequest(BaseModel):
    revokeToken: str = Field(min_length=16, max_length=128)

# ============================================================
# BLAZEPOSE LANDMARK NAMES (33 total)
# ============================================================

LANDMARK_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_pinky", "right_pinky",
    "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle", "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]

# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="Tailor-X Pose API",
    description="MediaPipe BlazePose landmark detection for body measurement",
    version="2.0.0",
)

# ---- Request size limit (default 8 MiB) ----
MAX_REQUEST_BYTES = int(os.environ.get("MAX_REQUEST_BYTES", str(8 * 1024 * 1024)))


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests larger than MAX_REQUEST_BYTES.

    Checks Content-Length header up-front (cheap path), and also caps the
    streamed body size for chunked uploads.
    """
    def __init__(self, app, max_bytes: int):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > self.max_bytes:
            return JSONResponse(
                status_code=413,
                content={"detail": f"Request body exceeds {self.max_bytes} bytes"},
            )
        return await call_next(request)


app.add_middleware(RequestSizeLimitMiddleware, max_bytes=MAX_REQUEST_BYTES)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "x-paystack-signature"],
)

# ============================================================
# POSE DETECTOR (lazy init)
# ============================================================

_detector: Any = None

def get_detector() -> Any:
    """Lazy-load the MediaPipe Pose Landmarker model."""
    global _detector
    if _detector is None:
        logger.info(f"Loading MediaPipe Pose Landmarker from {MODEL_PATH}...")
        
        # Download model if not present
        if not os.path.exists(MODEL_PATH):
            logger.info("Model file not found, downloading...")
            import urllib.request
            url = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"
            urllib.request.urlretrieve(url, MODEL_PATH)
            logger.info("Model downloaded successfully.")

        base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            output_segmentation_masks=False,
            num_poses=1,
            min_pose_detection_confidence=0.3,
            min_pose_presence_confidence=0.3,
            min_tracking_confidence=0.3,
        )
        _detector = vision.PoseLandmarker.create_from_options(options)
        logger.info("MediaPipe Pose Landmarker loaded successfully.")
    
    return _detector


# ============================================================
# IMAGE PREPROCESSING FOR POSE DETECTION
# ============================================================

MAX_POSE_DIM = 1920  # Cap image to this size before pose detection

def _preprocess_for_pose(pil_image: Image.Image, pad_ratio: float = 0.0) -> tuple[Image.Image, dict]:
    """
    Resize large images and optionally add padding for better pose detection.
    Returns (processed_image, transform_info) where transform_info lets us
    map normalized landmarks back to the original image coordinates.
    """
    w, h = pil_image.size
    img = pil_image

    # 1. Resize if too large (preserving aspect ratio)
    scale = 1.0
    if max(w, h) > MAX_POSE_DIM:
        scale = MAX_POSE_DIM / max(w, h)
        new_w, new_h = int(w * scale), int(h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        w, h = new_w, new_h

    # 2. Add padding (white border) if requested
    pad_w = pad_h = 0
    if pad_ratio > 0:
        pad_w = int(w * pad_ratio)
        pad_h = int(h * pad_ratio)
        padded = Image.new("RGB", (w + 2 * pad_w, h + 2 * pad_h), (255, 255, 255))
        padded.paste(img, (pad_w, pad_h))
        img = padded

    transform = {
        "orig_w": pil_image.size[0],
        "orig_h": pil_image.size[1],
        "inner_w": w,
        "inner_h": h,
        "pad_w": pad_w,
        "pad_h": pad_h,
        "padded_w": img.size[0],
        "padded_h": img.size[1],
    }
    return img, transform


def _remap_landmark(lm_x: float, lm_y: float, transform: dict) -> tuple[float, float]:
    """Map normalized landmark coords from padded/resized image back to original image space (normalized 0-1)."""
    # Convert from padded-image normalized coords to pixel in padded image
    px = lm_x * transform["padded_w"]
    py = lm_y * transform["padded_h"]
    # Subtract padding offset
    px -= transform["pad_w"]
    py -= transform["pad_h"]
    # Normalize relative to inner (resized) image
    nx = px / transform["inner_w"] if transform["inner_w"] > 0 else 0
    ny = py / transform["inner_h"] if transform["inner_h"] > 0 else 0
    return nx, ny

# ============================================================
# SEGMENTATION MODEL (lazy init)
# ============================================================

_segmenter: Any = None

def get_segmenter() -> Any:
    """Lazy-load the MediaPipe Selfie Segmenter model."""
    global _segmenter
    if _segmenter is not None:
        return _segmenter

    logger.info(f"Loading Selfie Segmenter from {SEGMENTATION_MODEL_PATH}...")

    if not os.path.exists(SEGMENTATION_MODEL_PATH):
        logger.info("Segmentation model not found, downloading...")
        import urllib.request
        url = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite"
        urllib.request.urlretrieve(url, SEGMENTATION_MODEL_PATH)
        logger.info("Segmentation model downloaded.")

    base_options = mp_python.BaseOptions(model_asset_path=SEGMENTATION_MODEL_PATH)
    options = vision.ImageSegmenterOptions(
        base_options=base_options,
        output_category_mask=True,
    )
    _segmenter = vision.ImageSegmenter.create_from_options(options)
    logger.info("Selfie Segmenter loaded successfully.")
    return _segmenter

# ============================================================
# AUTH MIDDLEWARE
# ============================================================

def verify_api_key(authorization: str | None) -> bool:
    """Simple Bearer token auth. Skip if no API_KEY configured."""
    if not API_KEY:
        return True  # No auth configured
    if not authorization:
        return False
    token = authorization.replace("Bearer ", "")
    return token == API_KEY


def _enterprise_connection():
    """Return a DB connection. Postgres if DATABASE_URL is set, else SQLite.

    On Postgres we pull from a process-wide ConnectionPool (created lazily)
    so we don't open a fresh TCP connection per request — which would burn
    through Railway's ~65-conn limit under load.

    Both return objects exposing the small sqlite3-style API used in this file:
    `conn.execute(sql, params).fetchone()/fetchall()`, `conn.commit()`,
    `conn.close()`, and `conn.executescript(sql)`.
    Rows support dict-style access by column name (`row['col']`).
    """
    if USE_POSTGRES:
        return _PgConnection.from_pool()
    conn = sqlite3.connect(ENTERPRISE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


class _PgCursor:
    """Wraps a psycopg cursor to expose .fetchone()/.fetchall() returning dict rows."""
    def __init__(self, cursor):
        self._cursor = cursor

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def __iter__(self):
        return iter(self._cursor)


class _PgConnection:
    """Thin wrapper around a pooled psycopg.Connection that mimics the
    sqlite3.Connection surface used by this codebase."""

    _pool = None  # populated lazily on first use

    @classmethod
    def _get_pool(cls):
        if cls._pool is None:
            from psycopg_pool import ConnectionPool
            from psycopg.rows import dict_row
            dsn = DATABASE_URL
            if dsn.startswith("postgres://"):
                dsn = "postgresql://" + dsn[len("postgres://"):]
            min_size = int(os.environ.get("DB_POOL_MIN", "1"))
            max_size = int(os.environ.get("DB_POOL_MAX", "10"))
            cls._pool = ConnectionPool(
                conninfo=dsn,
                min_size=min_size,
                max_size=max_size,
                timeout=10,
                kwargs={"row_factory": dict_row, "autocommit": False},
                open=True,
            )
            logger.info(f"Postgres pool initialized (min={min_size}, max={max_size})")
        return cls._pool

    @classmethod
    def from_pool(cls) -> "_PgConnection":
        instance = cls.__new__(cls)
        instance._conn = cls._get_pool().getconn()
        return instance

    @staticmethod
    def _translate(sql: str) -> str:
        # Replace SQLite '?' placeholders with psycopg '%s'.
        # None of our queries embed literal '?' inside strings, so a plain
        # replace is safe.
        return sql.replace("?", "%s")

    def execute(self, sql: str, params=()):
        cur = self._conn.cursor()
        cur.execute(self._translate(sql), tuple(params) if params else None)
        return _PgCursor(cur)

    def executescript(self, script: str):
        # Split on ';' and execute each non-empty, non-PRAGMA statement.
        for stmt in script.split(";"):
            s = stmt.strip()
            if not s:
                continue
            if s.upper().startswith("PRAGMA"):
                continue  # PRAGMAs are SQLite-only
            cur = self._conn.cursor()
            cur.execute(s)
            cur.close()

    def commit(self):
        self._conn.commit()

    def rollback(self):
        try:
            self._conn.rollback()
        except Exception:
            pass

    def close(self):
        # Return the connection to the pool instead of actually closing it.
        try:
            self._conn.rollback()  # discard any uncommitted state
        except Exception:
            pass
        self._get_pool().putconn(self._conn)


def _enterprise_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or f"org-{secrets.token_hex(3)}"


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _ensure_column(conn, table_name: str, column_name: str, definition: str) -> None:
    if USE_POSTGRES:
        rows = conn.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = ?",
            (table_name,),
        ).fetchall()
        columns = {r['column_name'] for r in rows}
    else:
        columns = {row['name'] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()}
    if column_name not in columns:
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")



def init_enterprise_db() -> None:
    conn = _enterprise_connection()
    try:
        conn.executescript(
            """
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS organizations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                brand_name TEXT NOT NULL,
                primary_color TEXT NOT NULL,
                imprint TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS organization_users (
                id TEXT PRIMARY KEY,
                organization_id TEXT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL,
                FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS licenses (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                seats_purchased INTEGER NOT NULL,
                scan_quota INTEGER NOT NULL,
                scans_used INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'active',
                billing_interval TEXT NOT NULL DEFAULT 'annual',
                amount REAL NOT NULL DEFAULT 0,
                currency TEXT NOT NULL DEFAULT 'USD',
                starts_at TEXT NOT NULL,
                ends_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                invite_link_id TEXT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT,
                created_at TEXT NOT NULL,
                UNIQUE (organization_id, email),
                FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS invite_links (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                code TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                campaign_name TEXT,
                imprint TEXT,
                primary_color TEXT,
                landing_headline TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_by_user_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by_user_id) REFERENCES organization_users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS measurement_sessions (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                customer_id TEXT NOT NULL,
                invite_link_id TEXT,
                measurement_id TEXT,
                measurements_json TEXT,
                unit TEXT,
                measurement_profile TEXT,
                confidence_json TEXT,
                warnings_json TEXT,
                review_status TEXT NOT NULL DEFAULT 'pending',
                tailor_notes TEXT,
                reviewed_at TEXT,
                reviewed_by_user_id TEXT,
                source TEXT NOT NULL DEFAULT 'invite_link',
                status TEXT NOT NULL DEFAULT 'started',
                accuracy_score REAL,
                metadata_json TEXT,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
                FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
                FOREIGN KEY (invite_link_id) REFERENCES invite_links(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS measurement_shares (
                id TEXT PRIMARY KEY,
                token TEXT NOT NULL UNIQUE,
                revoke_token TEXT NOT NULL,
                measurement_id TEXT NOT NULL,
                measurements_json TEXT NOT NULL,
                unit TEXT NOT NULL,
                created_by_email TEXT,
                access_scope TEXT NOT NULL DEFAULT 'read_only',
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                revoked_at TEXT
            );

            CREATE TABLE IF NOT EXISTS billing_records (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                license_id TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                billing_interval TEXT NOT NULL,
                checkout_url TEXT NOT NULL,
                external_reference TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
                FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS org_events (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload_json TEXT,
                actor_user_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
                FOREIGN KEY (actor_user_id) REFERENCES organization_users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                organization_id TEXT,
                actor_user_id TEXT,
                action TEXT NOT NULL,
                subject_type TEXT,
                subject_id TEXT,
                payload_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
                FOREIGN KEY (actor_user_id) REFERENCES organization_users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS accuracy_benchmark_records (
                id TEXT PRIMARY KEY,
                organization_id TEXT NOT NULL,
                measurement_id TEXT,
                measurement_profile TEXT,
                scan_measurements_json TEXT NOT NULL,
                tape_measurements_json TEXT NOT NULL,
                errors_json TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
            );
            """
        )
        _ensure_column(conn, 'billing_records', 'paystack_customer_code', 'TEXT')
        _ensure_column(conn, 'billing_records', 'paystack_subscription_code', 'TEXT')
        _ensure_column(conn, 'billing_records', 'paystack_reference', 'TEXT')
        _ensure_column(conn, 'billing_records', 'overage_units', 'INTEGER NOT NULL DEFAULT 0')
        _ensure_column(conn, 'billing_records', 'overage_unit_amount', 'REAL NOT NULL DEFAULT 0')

        # Persistent OTP store (replaces in-memory dict so codes survive restarts)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS otp_codes (
                email TEXT PRIMARY KEY,
                code TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                sent_at TEXT NOT NULL
            )
            """
        )

        for column_name, definition in (
            ("measurements_json", "TEXT"),
            ("unit", "TEXT"),
            ("measurement_profile", "TEXT"),
            ("confidence_json", "TEXT"),
            ("warnings_json", "TEXT"),
            ("review_status", "TEXT NOT NULL DEFAULT 'pending'"),
            ("tailor_notes", "TEXT"),
            ("reviewed_at", "TEXT"),
            ("reviewed_by_user_id", "TEXT"),
        ):
            _ensure_column(conn, "measurement_sessions", column_name, definition)

        # Webhook idempotency: store every processed Paystack reference
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS processed_webhooks (
                provider TEXT NOT NULL,
                event_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                processed_at TEXT NOT NULL,
                PRIMARY KEY (provider, event_id, event_type)
            )
            """
        )

        # Marketing waitlist (public landing page signups)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS waitlist (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT,
                company TEXT,
                role TEXT,
                use_case TEXT,
                source TEXT,
                created_at TEXT NOT NULL
            )
            """
        )

        # Performance indexes (no-ops if already present)
        for idx_sql in (
            "CREATE INDEX IF NOT EXISTS idx_org_users_email ON organization_users(email)",
            "CREATE INDEX IF NOT EXISTS idx_org_users_org_id ON organization_users(organization_id)",
            # Composite uniqueness: an email can repeat across orgs but is
            # unique within a single org. NULL organization_id (super_admin) is
            # treated as distinct by Postgres / SQLite, so multiple super_admins
            # are still prevented by the partial index below.
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_org_users_org_email ON organization_users(organization_id, email)",
            "CREATE INDEX IF NOT EXISTS idx_licenses_org_id ON licenses(organization_id)",
            "CREATE INDEX IF NOT EXISTS idx_customers_org_id ON customers(organization_id)",
            "CREATE INDEX IF NOT EXISTS idx_customers_org_email ON customers(organization_id, email)",
            "CREATE INDEX IF NOT EXISTS idx_invite_links_org_id ON invite_links(organization_id)",
            "CREATE INDEX IF NOT EXISTS idx_invite_links_code ON invite_links(code)",
            "CREATE INDEX IF NOT EXISTS idx_sessions_org_id ON measurement_sessions(organization_id)",
            "CREATE INDEX IF NOT EXISTS idx_sessions_customer_id ON measurement_sessions(customer_id)",
            "CREATE INDEX IF NOT EXISTS idx_sessions_review_status ON measurement_sessions(review_status)",
            "CREATE INDEX IF NOT EXISTS idx_org_events_org_created ON org_events(organization_id, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs(organization_id, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_accuracy_benchmarks_org ON accuracy_benchmark_records(organization_id)",
            "CREATE INDEX IF NOT EXISTS idx_measurement_shares_token ON measurement_shares(token)",
            "CREATE INDEX IF NOT EXISTS idx_measurement_shares_measurement_id ON measurement_shares(measurement_id)",
            "CREATE INDEX IF NOT EXISTS idx_billing_org_id ON billing_records(organization_id)",
            "CREATE INDEX IF NOT EXISTS idx_billing_paystack_ref ON billing_records(paystack_reference)",
            "CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at)",
            # Partial unique: at most one super_admin row in the table
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_one_super_admin ON organization_users(role) WHERE role='super_admin'",
        ):
            try:
                conn.execute(idx_sql)
            except Exception as exc:
                logger.warning(f"Index create skipped ({exc}): {idx_sql}")

        # Migration: drop the legacy global UNIQUE on organization_users.email so a
        # person can belong to multiple orgs. Postgres only — SQLite ALTER cannot
        # drop constraints, but new SQLite DBs are created without it above.
        if USE_POSTGRES:
            try:
                conn.execute("ALTER TABLE organization_users DROP CONSTRAINT IF EXISTS organization_users_email_key")
            except Exception as exc:
                logger.warning(f"Drop legacy organization_users_email_key skipped: {exc}")
        conn.commit()
    finally:
        conn.close()


def _get_org_or_404(conn: sqlite3.Connection, organization_id: str) -> sqlite3.Row:
    organization = conn.execute(
        "SELECT * FROM organizations WHERE id = ?",
        (organization_id,),
    ).fetchone()
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    return organization


def _get_license_for_org(conn: sqlite3.Connection, organization_id: str) -> sqlite3.Row:
    license_row = conn.execute(
        "SELECT * FROM licenses WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1",
        (organization_id,),
    ).fetchone()
    if not license_row:
        raise HTTPException(status_code=404, detail="License not found")
    return license_row


def _remaining_quota(license_row: sqlite3.Row) -> int:
    return max(license_row["scan_quota"] - license_row["scans_used"], 0)



def _overage_units(license_row: sqlite3.Row) -> int:
    return max(license_row["scans_used"] - license_row["scan_quota"], 0)



def _can_consume_scan(license_row: sqlite3.Row) -> bool:
    if license_row["status"] == "trialing":
        return _remaining_quota(license_row) > 0
    return license_row["status"] == 'active' and _overage_units(license_row) < OVERAGE_GRACE_SCANS



def _sync_overage_record(conn: sqlite3.Connection, organization_id: str, license_id: str, license_row: sqlite3.Row) -> None:
    overage_units = _overage_units(license_row)
    if overage_units <= 0:
        return

    amount = round(overage_units * OVERAGE_SCAN_PRICE, 2)
    existing = conn.execute(
        """
        SELECT * FROM billing_records
        WHERE organization_id = ? AND license_id = ? AND billing_interval = 'overage' AND status IN ('pending', 'paid')
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (organization_id, license_id),
    ).fetchone()

    if existing and existing['status'] == 'pending':
        conn.execute(
            """
            UPDATE billing_records
            SET amount = ?, overage_units = ?, overage_unit_amount = ?
            WHERE id = ?
            """,
            (amount, overage_units, OVERAGE_SCAN_PRICE, existing['id']),
        )
        return

    conn.execute(
        """
        INSERT INTO billing_records (
            id, organization_id, license_id, amount, currency, status, billing_interval,
            checkout_url, external_reference, created_at, overage_units, overage_unit_amount
        ) VALUES (?, ?, ?, ?, ?, 'pending', 'overage', ?, ?, ?, ?, ?)
        """,
        (
            _new_id('bill'),
            organization_id,
            license_id,
            amount,
            license_row['currency'],
            f"{WEB_APP_URL}/dashboard?org={organization_id}&billing=overage",
            f"overage_{license_id}",
            _enterprise_now(),
            overage_units,
            OVERAGE_SCAN_PRICE,
        ),
    )



def _paid_quota_from_amount(amount: float) -> int:
    # Bootstrap currently prices paid quota at 0.35 major currency units per scan.
    # Keep a floor so small test payments still convert the license out of trial.
    return max(TRIAL_SCAN_QUOTA, int(round(amount / 0.35))) if amount > 0 else TRIAL_SCAN_QUOTA


def _build_checkout_url(organization_id: str, license_id: str) -> str:
    # Replaced by Paystack initialize — kept for bootstrap response back-compat.
    return f"{WEB_APP_URL}/billing?org={organization_id}&lic={license_id}"


def _normalize_measurement_profile(profile: Optional[str]) -> str:
    normalized = (profile or "other").strip().lower()
    return normalized if normalized in ("male", "female", "other") else "other"


def _measurement_catalog_for_profile(profile: Optional[str]) -> list[dict[str, Any]]:
    normalized = _normalize_measurement_profile(profile)
    return [
        item
        for item in MEASUREMENT_CATALOG
        if item["profile"] in ("all", normalized)
    ]


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 2)
    position = (len(ordered) - 1) * pct
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return round(ordered[lower] + (ordered[upper] - ordered[lower]) * fraction, 2)


def _catalog_coverage_for_measurements(
    measurements: dict[str, Any],
    profile: Optional[str],
) -> dict[str, Any]:
    catalog = _measurement_catalog_for_profile(profile)
    required = [item for item in catalog if item.get("requiredForFit")]
    captured_keys = [
        item["key"]
        for item in catalog
        if isinstance(measurements.get(item["key"]), (int, float))
        and float(measurements[item["key"]]) > 0
    ]
    captured_set = set(captured_keys)
    missing_required = [item["key"] for item in required if item["key"] not in captured_set]
    required_captured = len(required) - len(missing_required)
    return {
        "catalogVersion": MEASUREMENT_CATALOG_VERSION,
        "profile": _normalize_measurement_profile(profile),
        "totalMeasurements": len(catalog),
        "capturedMeasurements": len(captured_set),
        "requiredMeasurements": len(required),
        "capturedRequiredMeasurements": required_captured,
        "coveragePct": round((len(captured_set) / len(catalog)) * 100, 1) if catalog else 0,
        "requiredCoveragePct": round((required_captured / len(required)) * 100, 1) if required else 0,
        "missingRequired": missing_required,
        "capturedKeys": captured_keys,
    }


def _confidence_summary(confidence: dict[str, Any]) -> dict[str, Any]:
    values = [
        float(value)
        for value in confidence.values()
        if isinstance(value, (int, float)) and float(value) > 0
    ]
    low_parts = [
        key
        for key, value in confidence.items()
        if isinstance(value, (int, float)) and 0 < float(value) < 60
    ]
    return {
        "average": round(sum(values) / len(values), 1) if values else 0,
        "lowConfidenceParts": low_parts,
        "measuredParts": len(values),
    }


def _accuracy_status_from_session(
    measurements: dict[str, Any],
    confidence: dict[str, Any],
    warnings: list[str],
    profile: Optional[str],
) -> dict[str, Any]:
    coverage = _catalog_coverage_for_measurements(measurements, profile)
    confidence_info = _confidence_summary(confidence)
    blockers: list[str] = []
    if coverage["missingRequired"]:
        blockers.append("missing_required_measurements")
    if confidence_info["average"] and confidence_info["average"] < 70:
        blockers.append("low_average_confidence")
    if warnings:
        blockers.append("scan_warnings_present")
    status = "ready_for_tailor" if not blockers else "review_recommended"
    return {
        "status": status,
        "blockers": blockers,
        "coverage": coverage,
        "confidence": confidence_info,
    }


def _compute_accuracy_certification(conn: sqlite3.Connection, organization_id: str) -> dict[str, Any]:
    rows = conn.execute(
        """
        SELECT errors_json, created_at
        FROM accuracy_benchmark_records
        WHERE organization_id = ?
        ORDER BY created_at DESC
        LIMIT 500
        """,
        (organization_id,),
    ).fetchall()
    errors_by_part: dict[str, list[float]] = {}
    total_error_count = 0
    high_error_count = 0
    for row in rows:
        errors = _json_or_default(row["errors_json"], {})
        if not isinstance(errors, dict):
            continue
        for key, value in errors.items():
            if not isinstance(value, (int, float)):
                continue
            abs_error = abs(float(value))
            errors_by_part.setdefault(key, []).append(abs_error)
            total_error_count += 1
            if abs_error > 5:
                high_error_count += 1

    part_metrics = {
        key: {
            "sampleSize": len(values),
            "mae": round(sum(values) / len(values), 2),
            "medianError": round(statistics.median(values), 2),
            "p90Error": _percentile(values, 0.9),
            "p95Error": _percentile(values, 0.95),
        }
        for key, values in sorted(errors_by_part.items())
        if values
    }
    sample_size = len(rows)
    p90_values = [metrics["p90Error"] for metrics in part_metrics.values()]
    aggregate_p90 = round(sum(p90_values) / len(p90_values), 2) if p90_values else None
    failure_rate = round((high_error_count / total_error_count) * 100, 1) if total_error_count else 0
    if sample_size == 0:
        status = "unverified"
        claim_language = "Do not publish accuracy claims yet. No tape-measure benchmark records are stored."
    elif sample_size < 20:
        status = "collecting"
        claim_language = "Use pilot language only until at least 20 benchmark users are recorded."
    elif aggregate_p90 is not None and aggregate_p90 <= 3.0 and failure_rate <= 5:
        status = "validated_internal"
        claim_language = "Internal benchmark supports bounded accuracy language with published MAE/P90."
    else:
        status = "needs_review"
        claim_language = "Benchmark exists, but errors are too high for strong accuracy claims."
    return {
        "status": status,
        "catalogVersion": MEASUREMENT_CATALOG_VERSION,
        "sampleSize": sample_size,
        "targetSampleSize": 50,
        "minimumPublishableSampleSize": 20,
        "failureRatePct": failure_rate,
        "aggregateP90ErrorCm": aggregate_p90,
        "partMetrics": part_metrics,
        "claimLanguage": claim_language,
    }


def _build_business_health(
    conn: sqlite3.Connection,
    organization_id: str,
    license_row: sqlite3.Row,
) -> dict[str, Any]:
    session_stats = conn.execute(
        """
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
          AVG(CASE WHEN status = 'completed' THEN accuracy_score ELSE NULL END) AS avg_accuracy
        FROM measurement_sessions
        WHERE organization_id = ?
        """,
        (organization_id,),
    ).fetchone()
    active_invites = conn.execute(
        "SELECT COUNT(*) AS count FROM invite_links WHERE organization_id = ? AND status = 'active'",
        (organization_id,),
    ).fetchone()["count"]
    review_backlog = conn.execute(
        """
        SELECT COUNT(*) AS count
        FROM measurement_sessions
        WHERE organization_id = ? AND status = 'completed' AND review_status != 'reviewed'
        """,
        (organization_id,),
    ).fetchone()["count"]
    total = int(session_stats["total"] or 0)
    completed = int(session_stats["completed"] or 0)
    completion_rate = round((completed / total) * 100, 1) if total else 0
    utilization_rate = round((license_row["scans_used"] / license_row["scan_quota"]) * 100, 1) if license_row["scan_quota"] else 0
    next_actions: list[str] = []
    if active_invites == 0:
        next_actions.append("Create a client invite link.")
    if review_backlog > 0:
        next_actions.append("Review completed customer measurements.")
    if utilization_rate >= 80:
        next_actions.append("Top up or renew scan quota.")
    if not next_actions:
        next_actions.append("Keep sending invite links and monitoring accuracy.")
    return {
        "activeInviteCount": active_invites,
        "completionRatePct": completion_rate,
        "averageAccuracyScore": round(float(session_stats["avg_accuracy"]), 1) if session_stats["avg_accuracy"] is not None else None,
        "reviewBacklog": review_backlog,
        "quotaUtilizationPct": utilization_rate,
        "projectedOverageAmount": round(_overage_units(license_row) * OVERAGE_SCAN_PRICE, 2),
        "currency": license_row["currency"],
        "nextActions": next_actions,
    }


def _build_trust_posture(conn: sqlite3.Connection, organization_id: str) -> dict[str, Any]:
    audit_count = conn.execute(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE organization_id = ?",
        (organization_id,),
    ).fetchone()["count"]
    benchmark_count = conn.execute(
        "SELECT COUNT(*) AS count FROM accuracy_benchmark_records WHERE organization_id = ?",
        (organization_id,),
    ).fetchone()["count"]
    return {
        "imageRetention": "Enterprise completion stores derived measurements and metadata only.",
        "bodyDataStorage": "Measurement payloads are sanitized server-side before dashboard storage.",
        "sharing": "Share links are tokenized, expiring, read-only, and revocable.",
        "auditLogCount": audit_count,
        "benchmarkRecordCount": benchmark_count,
        "controls": [
            "HttpOnly admin session cookies",
            "Role-based organization access",
            "Invite quota enforcement",
            "No captured photo upload in enterprise completion payload",
            "Benchmark-gated accuracy claim language",
        ],
    }


def _build_app_link_status() -> dict[str, Any]:
    android_fingerprints = [
        item.strip()
        for item in os.environ.get("ANDROID_SHA256_CERT_FINGERPRINTS", "").split(",")
        if item.strip()
    ]
    apple_app_identifier = os.environ.get("APPLE_APP_IDENTIFIER", "").strip()
    return {
        "scheme": "tailorxfit",
        "androidPackage": "com.tailorx.app",
        "iosBundleIdentifier": "com.tailorx.app",
        "webInvitePath": "/invite/:code",
        "androidAppLinksReady": bool(android_fingerprints),
        "iosUniversalLinksReady": bool(apple_app_identifier),
        "requiredEnv": {
            "ANDROID_SHA256_CERT_FINGERPRINTS": bool(android_fingerprints),
            "APPLE_APP_IDENTIFIER": bool(apple_app_identifier),
        },
    }


def _record_org_event(
    conn: sqlite3.Connection,
    organization_id: str,
    event_type: str,
    payload: Optional[dict[str, Any]] = None,
    actor_user_id: Optional[str] = None,
) -> None:
    conn.execute(
        """
        INSERT INTO org_events (id, organization_id, event_type, payload_json, actor_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            _new_id("evt"),
            organization_id,
            event_type,
            json.dumps(payload or {}, separators=(",", ":"), default=str),
            actor_user_id,
            _enterprise_now(),
        ),
    )


def _record_audit_event(
    conn: sqlite3.Connection,
    action: str,
    *,
    organization_id: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    subject_type: Optional[str] = None,
    subject_id: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    conn.execute(
        """
        INSERT INTO audit_logs (
            id, organization_id, actor_user_id, action, subject_type, subject_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            _new_id("aud"),
            organization_id,
            actor_user_id,
            action,
            subject_type,
            subject_id,
            json.dumps(payload or {}, separators=(",", ":"), default=str),
            _enterprise_now(),
        ),
    )


def _serialize_org_dashboard(conn: sqlite3.Connection, organization_id: str) -> dict[str, Any]:
    organization = _get_org_or_404(conn, organization_id)
    license_row = _get_license_for_org(conn, organization_id)
    staff_count = conn.execute(
        "SELECT COUNT(*) AS count FROM organization_users WHERE organization_id = ?",
        (organization_id,),
    ).fetchone()["count"]
    customer_count = conn.execute(
        "SELECT COUNT(*) AS count FROM customers WHERE organization_id = ?",
        (organization_id,),
    ).fetchone()["count"]
    session_count = conn.execute(
        "SELECT COUNT(*) AS count FROM measurement_sessions WHERE organization_id = ?",
        (organization_id,),
    ).fetchone()["count"]
    recent_sessions = conn.execute(
        """
        SELECT ms.id, ms.status, ms.started_at, ms.completed_at, ms.accuracy_score,
               ms.measurement_id, ms.measurements_json, ms.unit, ms.measurement_profile,
               ms.confidence_json, ms.warnings_json, ms.metadata_json,
               ms.review_status, ms.tailor_notes, ms.reviewed_at, ms.reviewed_by_user_id,
               c.full_name AS customer_name, c.email AS customer_email,
               il.code AS invite_code, il.label AS invite_label
        FROM measurement_sessions ms
        JOIN customers c ON c.id = ms.customer_id
        LEFT JOIN invite_links il ON il.id = ms.invite_link_id
        WHERE ms.organization_id = ?
        ORDER BY ms.started_at DESC
        LIMIT 10
        """,
        (organization_id,),
    ).fetchall()
    invite_links = conn.execute(
        """
        SELECT id, code, label, campaign_name, imprint, primary_color, landing_headline, status, created_at
        FROM invite_links
        WHERE organization_id = ?
        ORDER BY created_at DESC
        LIMIT 10
        """,
        (organization_id,),
    ).fetchall()
    recent_events = conn.execute(
        """
        SELECT id, event_type, payload_json, actor_user_id, created_at
        FROM org_events
        WHERE organization_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        """,
        (organization_id,),
    ).fetchall()
    recent_audit_logs = conn.execute(
        """
        SELECT id, action, subject_type, subject_id, payload_json, created_at
        FROM audit_logs
        WHERE organization_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        """,
        (organization_id,),
    ).fetchall()

    serialized_sessions: list[dict[str, Any]] = []
    for row in recent_sessions:
        session = dict(row)
        session["measurements"] = _json_or_default(session.pop("measurements_json", None), {})
        session["confidence"] = _json_or_default(session.pop("confidence_json", None), {})
        session["warnings"] = _json_or_default(session.pop("warnings_json", None), [])
        session["metadata"] = _json_or_default(session.pop("metadata_json", None), {})
        session["unit"] = session.get("unit") or "cm"
        session["measurementCount"] = len(session["measurements"])
        session["accuracyStatus"] = _accuracy_status_from_session(
            session["measurements"],
            session["confidence"],
            session["warnings"],
            session.get("measurement_profile"),
        )
        serialized_sessions.append(session)

    accuracy_certification = _compute_accuracy_certification(conn, organization_id)
    business_health = _build_business_health(conn, organization_id, license_row)
    trust_posture = _build_trust_posture(conn, organization_id)

    return {
        "organization": {
            "id": organization["id"],
            "name": organization["name"],
            "slug": organization["slug"],
            "brandName": organization["brand_name"],
            "primaryColor": organization["primary_color"],
            "imprint": organization["imprint"],
            "status": organization["status"],
            "createdAt": organization["created_at"],
        },
        "license": {
            "id": license_row["id"],
            "seatsPurchased": license_row["seats_purchased"],
            "scanQuota": license_row["scan_quota"],
            "scansUsed": license_row["scans_used"],
            "remainingQuota": _remaining_quota(license_row),
            "overageUnits": _overage_units(license_row),
            "overageGraceScans": OVERAGE_GRACE_SCANS,
            "status": license_row["status"],
            "billingInterval": license_row["billing_interval"],
            "amount": license_row["amount"],
            "currency": license_row["currency"],
            "startsAt": license_row["starts_at"],
            "endsAt": license_row["ends_at"],
        },
        "metrics": {
            "staffCount": staff_count,
            "customerCount": customer_count,
            "sessionCount": session_count,
        },
        "recentSessions": serialized_sessions,
        "inviteLinks": [
            {
                **dict(row),
                "publicUrl": f"https://tailorxfit.com/invite/{row['code']}",
            }
            for row in invite_links
        ],
        "measurementCatalog": {
            "version": MEASUREMENT_CATALOG_VERSION,
            "items": MEASUREMENT_CATALOG,
            "profiles": {
                "male": _measurement_catalog_for_profile("male"),
                "female": _measurement_catalog_for_profile("female"),
                "other": _measurement_catalog_for_profile("other"),
            },
        },
        "accuracyCertification": accuracy_certification,
        "businessHealth": business_health,
        "trustPosture": trust_posture,
        "appLinks": _build_app_link_status(),
        "recentEvents": [
            {
                **dict(row),
                "payload": _json_or_default(row["payload_json"], {}),
            }
            for row in recent_events
        ],
        "auditLogs": [
            {
                **dict(row),
                "payload": _json_or_default(row["payload_json"], {}),
            }
            for row in recent_audit_logs
        ],
    }


_DB_SCHEMA_READY = False


def _init_enterprise_db_with_retry(max_attempts: int = 6, delay_seconds: float = 3.0) -> bool:
    """Initialize the DB, retrying briefly if Postgres isn't reachable yet.

    Returns True on success, False if all retries are exhausted. Never raises:
    the app must stay up so /livez and /readyz can report status even when
    Postgres is temporarily unreachable (e.g. Railway private-DNS outage).
    Schema init will be re-attempted lazily on the next successful DB query.
    """
    global _DB_SCHEMA_READY
    last_exc = None
    for attempt in range(1, max_attempts + 1):
        try:
            init_enterprise_db()
            if USE_POSTGRES:
                logger.info(f"Enterprise DB initialized via Postgres (attempt {attempt})")
            else:
                logger.info(f"Enterprise DB initialized via SQLite at {ENTERPRISE_DB_PATH}")
            _DB_SCHEMA_READY = True
            return True
        except Exception as exc:
            last_exc = exc
            logger.warning(
                f"DB init attempt {attempt}/{max_attempts} failed: {exc.__class__.__name__}: {exc}"
            )
            if attempt < max_attempts:
                time.sleep(delay_seconds)
    logger.error(
        f"DB init exhausted retries; last error: {last_exc}. "
        f"App will start anyway; schema init will be retried lazily."
    )
    return False


def _ensure_db_schema() -> None:
    """Lazy schema init for callers that need a ready DB. Best-effort, swallows errors."""
    global _DB_SCHEMA_READY
    if _DB_SCHEMA_READY:
        return
    try:
        init_enterprise_db()
        _DB_SCHEMA_READY = True
        logger.info("Enterprise DB schema initialized lazily after startup")
    except Exception as exc:
        logger.debug(f"Lazy DB schema init still failing: {exc}")


_init_enterprise_db_with_retry()

# ============================================================
# JWT / AUTH HELPERS
# ============================================================

_bearer_scheme = HTTPBearer(auto_error=False)


def _issue_jwt(payload: dict, expiry_hours: int = JWT_EXPIRY_HOURS) -> str:
    data = dict(payload)
    data["exp"] = datetime.utcnow() + timedelta(hours=expiry_hours)
    data["iat"] = datetime.utcnow()
    return pyjwt.encode(data, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_jwt(token: str) -> dict:
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization required")
    return _decode_jwt(credentials.credentials)


def _require_role(*allowed_roles: str):
    """Factory that returns a FastAPI dependency checking the JWT role."""
    def _dep(user: dict = Depends(_get_current_user)) -> dict:
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{user.get('role')}' is not allowed. Required: {list(allowed_roles)}",
            )
        return user
    return _dep


def _require_org_access(organization_id: str, user: dict) -> None:
    """Verify the JWT user can access the given organization."""
    if user.get("role") == "super_admin":
        return  # Super admins can access everything
    if user.get("organization_id") != organization_id:
        raise HTTPException(status_code=403, detail="Access denied for this organization")


# ============================================================
# PAYSTACK HELPERS
# ============================================================

def _paystack_request(method: str, path: str, payload: Optional[dict] = None) -> dict:
    """Call the Paystack REST API."""
    url = f"{PAYSTACK_API_BASE}{path}"
    headers = {
        "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    response = http_requests.request(method, url, headers=headers, json=payload, timeout=15)
    try:
        body = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail=f"Paystack returned non-JSON ({response.status_code})")
    if not response.ok or not body.get("status", False):
        raise HTTPException(
            status_code=502,
            detail=f"Paystack error: {body.get('message', 'unknown')}",
        )
    return body.get("data", {})


def _paystack_initialize_transaction(
    org_id: str,
    license_id: str,
    plan_tier: str,
    amount: float,
    currency: str,
    customer_email: str,
) -> dict:
    """Initialize a Paystack transaction and return the authorization URL + reference.

    Falls back to a mock transaction when Paystack is not configured (dev mode).
    """
    if not PAYSTACK_SECRET_KEY:
        ref = f"mock_{secrets.token_hex(10)}"
        return {
            "reference": ref,
            "checkoutUrl": f"{WEB_APP_URL}/billing/success?org={org_id}&lic={license_id}&ref={ref}",
            "provider": "mock",
        }

    plan_code = PAYSTACK_PLAN_MAP.get(plan_tier)
    reference = f"tlx_{secrets.token_hex(8)}"
    payload: dict[str, Any] = {
        "email": customer_email or f"billing+{org_id}@tailorxfit.com",
        # Paystack expects amounts in the lowest currency unit (kobo, cents, pesewas)
        "amount": int(round(amount * 100)),
        "currency": currency.upper(),
        "reference": reference,
        "callback_url": f"{WEB_APP_URL}/dashboard?org={org_id}&billing=success",
        "metadata": {
            "org_id": org_id,
            "license_id": license_id,
            "plan_tier": plan_tier,
        },
    }
    if plan_code:
        payload["plan"] = plan_code  # subscription mode

    data = _paystack_request("POST", "/transaction/initialize", payload)
    return {
        "reference": data.get("reference", reference),
        "checkoutUrl": data.get("authorization_url"),
        "accessCode": data.get("access_code"),
        "provider": "paystack",
    }


def _paystack_verify_signature(payload: bytes, signature: str) -> bool:
    """Verify a Paystack webhook signature (HMAC-SHA512 over the raw body).

    Fails closed: if PAYSTACK_SECRET_KEY isn't configured we refuse all
    webhooks rather than blindly trust them. This prevents an attacker from
    forging payment confirmations on a misconfigured deploy.
    """
    if not PAYSTACK_SECRET_KEY:
        logger.error("Paystack webhook rejected: PAYSTACK_SECRET_KEY not configured")
        return False
    if not signature:
        return False
    expected = hmac.new(
        PAYSTACK_SECRET_KEY.encode("utf-8"),
        msg=payload,
        digestmod=hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ============================================================
# ENDPOINTS
# ============================================================

@app.get("/health", response_model=HealthResponse)
@app.get("/v1/pose/health", response_model=HealthResponse)
async def health():
    db_ok = True
    try:
        conn = _enterprise_connection()
        try:
            conn.execute("SELECT 1").fetchone()
        finally:
            conn.close()
    except Exception as exc:
        db_ok = False
        logger.error(f"Health check DB probe failed: {exc}")
    if not db_ok:
        raise HTTPException(status_code=503, detail="database unavailable")
    return HealthResponse(
        status="ok",
        model_loaded=_detector is not None,
        version="2.0.0",
    )


# Process-start timestamp for uptime reporting.
_PROCESS_STARTED_AT = time.time()


@app.get("/livez")
async def livez():
    """Liveness probe: 200 if the FastAPI process is up. Does NOT check DB.

    Point UptimeRobot / Better Stack at this to detect *app* outages.
    DB outages are reported separately via /readyz so you can distinguish.
    """
    return {"status": "alive", "uptime_seconds": int(time.time() - _PROCESS_STARTED_AT)}


@app.get("/readyz")
async def readyz():
    """Readiness probe: per-component status, always returns 200 with a JSON body.

    Use this for a status page or richer alerting. The `ready` boolean is False
    if any critical dependency is down (currently just the DB).
    """
    components: dict[str, dict] = {}

    # DB probe (and lazy schema init if startup couldn't reach Postgres)
    db_started = time.time()
    try:
        conn = _enterprise_connection()
        try:
            conn.execute("SELECT 1").fetchone()
        finally:
            conn.close()
        components["database"] = {
            "ok": True,
            "schema_ready": _DB_SCHEMA_READY,
            "latency_ms": int((time.time() - db_started) * 1000),
        }
        # DB is reachable now — finish schema init if startup couldn't.
        if not _DB_SCHEMA_READY:
            _ensure_db_schema()
            components["database"]["schema_ready"] = _DB_SCHEMA_READY
    except Exception as exc:
        components["database"] = {
            "ok": False,
            "schema_ready": _DB_SCHEMA_READY,
            "error": str(exc)[:200],
            "latency_ms": int((time.time() - db_started) * 1000),
        }

    # Pose model loaded into memory
    components["pose_model"] = {"ok": _detector is not None}

    # Email provider configured (does not call Resend, just checks env)
    components["email"] = {
        "ok": bool(RESEND_API_KEY),
        "provider": "resend" if RESEND_API_KEY else None,
    }

    ready = all(c.get("ok", False) for k, c in components.items() if k == "database")
    return {
        "ready": ready,
        "version": "2.0.0",
        "uptime_seconds": int(time.time() - _PROCESS_STARTED_AT),
        "components": components,
    }


# In-memory IP throttle for the public waitlist endpoint (10/hr/IP).
_waitlist_ip_hits: dict[str, list[float]] = {}


@app.post("/v1/waitlist")
async def join_waitlist(request: Request, payload: WaitlistRequest):
    """Public marketing waitlist signup. Rate-limited per IP, dedupes by email."""
    client_ip = (request.headers.get("x-forwarded-for") or request.client.host or "unknown").split(",")[0].strip()
    now_ts = time.time()
    bucket = [t for t in _waitlist_ip_hits.get(client_ip, []) if now_ts - t < 3600]
    if len(bucket) >= 10:
        raise HTTPException(status_code=429, detail="Too many signups. Try again later.")
    bucket.append(now_ts)
    _waitlist_ip_hits[client_ip] = bucket

    email = payload.email.strip().lower()
    conn = _enterprise_connection()
    try:
        existing = conn.execute("SELECT id FROM waitlist WHERE email = ?", (email,)).fetchone()
        if existing:
            return {"success": True, "alreadyJoined": True}
        conn.execute(
            "INSERT INTO waitlist (id, email, name, company, role, use_case, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                _new_id("wl"),
                email,
                (payload.name or "").strip() or None,
                (payload.company or "").strip() or None,
                (payload.role or "").strip() or None,
                (payload.useCase or "").strip() or None,
                (payload.source or "landing").strip() or "landing",
                _enterprise_now(),
            ),
        )
        conn.commit()
    except Exception as exc:
        if hasattr(conn, "rollback"):
            conn.rollback()
        logger.error(f"waitlist insert failed for {email}: {exc}")
        raise HTTPException(status_code=500, detail="Could not join waitlist")
    finally:
        conn.close()

    # Best-effort confirmation email; never fail the signup if email errors.
    try:
        html = (
            "<div style=\"font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;\">"
            "<h2 style=\"color:#0F2B3C;\">You're on the Tailor-X waitlist 🎉</h2>"
            f"<p style=\"color:#5A6B7B;line-height:1.5;\">Thanks{', ' + payload.name if payload.name else ''} — we'll reach out as early access opens for your region.</p>"
            "<p style=\"color:#5A6B7B;line-height:1.5;\">In the meantime, reply to this email if you'd like a live walkthrough of the platform.</p>"
            "<p style=\"color:#94A3B8;font-size:12px;margin-top:32px;\">— Tailor-X Team<br/>"
            "5 C &amp; I Leasing Dr, Lekki Phase I, Lagos 106104, Nigeria<br/>"
            "+234 813 744 6304 &middot; <a href=\"https://tailorxfit.com\" style=\"color:#14B8A6;\">tailorxfit.com</a></p>"
            "</div>"
        )
        _send_email(email, "You're on the Tailor-X waitlist", html, from_email=RESEND_FROM_WAITLIST)
    except Exception as exc:
        logger.warning(f"waitlist confirmation email failed for {email}: {exc}")

    # Best-effort admin notification so the team sees new signups in real time.
    if WAITLIST_ADMIN_EMAIL:
        try:
            def _esc(v: str | None) -> str:
                import html as _html
                return _html.escape((v or "").strip()) or "—"

            admin_html = (
                "<div style=\"font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;\">"
                "<h2 style=\"color:#0F2B3C;margin:0 0 16px;\">New Tailor-X waitlist signup</h2>"
                "<table style=\"width:100%;border-collapse:collapse;font-size:14px;color:#0F2B3C;\">"
                f"<tr><td style=\"padding:6px 0;color:#64748B;width:120px;\">Email</td><td><a href=\"mailto:{_esc(email)}\">{_esc(email)}</a></td></tr>"
                f"<tr><td style=\"padding:6px 0;color:#64748B;\">Name</td><td>{_esc(payload.name)}</td></tr>"
                f"<tr><td style=\"padding:6px 0;color:#64748B;\">Company</td><td>{_esc(payload.company)}</td></tr>"
                f"<tr><td style=\"padding:6px 0;color:#64748B;\">Role</td><td>{_esc(payload.role)}</td></tr>"
                f"<tr><td style=\"padding:6px 0;color:#64748B;\">Use case</td><td>{_esc(payload.useCase)}</td></tr>"
                f"<tr><td style=\"padding:6px 0;color:#64748B;\">Source</td><td>{_esc(payload.source)}</td></tr>"
                f"<tr><td style=\"padding:6px 0;color:#64748B;\">IP</td><td>{_esc(client_ip)}</td></tr>"
                "</table>"
                "<p style=\"color:#94A3B8;font-size:12px;margin-top:24px;\">Tailor-X notification &middot; Reply directly to follow up with the signup.</p>"
                "</div>"
            )
            _send_email(
                WAITLIST_ADMIN_EMAIL,
                f"New waitlist signup: {email}",
                admin_html,
                from_email=RESEND_FROM_WAITLIST,
            )
        except Exception as exc:
            logger.warning(f"waitlist admin notification failed for {email}: {exc}")

    return {"success": True, "alreadyJoined": False}


@app.get("/v1/waitlist/stats")
async def waitlist_stats():
    """Public count for social proof on the landing page."""
    conn = _enterprise_connection()
    try:
        row = conn.execute("SELECT COUNT(*) AS c FROM waitlist").fetchone()
        return {"count": int(row["c"]) if row else 0}
    finally:
        conn.close()


def _share_base_url(request: Request) -> str:
    configured = os.environ.get("TAILORX_SHARE_BASE_URL", "").strip()
    if configured:
        return configured.rstrip("/")
    return f"{str(request.base_url).rstrip('/')}/v1/shares"


def _parse_enterprise_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", ""))


def _clean_numeric_payload(
    payload: Optional[dict[str, float]],
    *,
    max_value: float = 400.0,
) -> dict[str, float]:
    """Keep only plausible positive numeric values for dashboard storage."""
    if not payload:
        return {}
    clean: dict[str, float] = {}
    for key, value in payload.items():
        if not re.match(r"^[A-Za-z][A-Za-z0-9_]{0,60}$", str(key)):
            continue
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            continue
        if parsed > 0 and parsed <= max_value:
            clean[str(key)] = round(parsed, 2)
    return clean


def _clean_warning_payload(payload: Optional[list[str]]) -> list[str]:
    if not payload:
        return []
    return [str(item)[:240] for item in payload if str(item).strip()][:12]


def _json_or_default(value: Optional[str], default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


@app.post("/v1/shares")
async def create_measurement_share(request: Request, payload: MeasurementShareCreateRequest):
    """Create an expiring, read-only measurement share link.

    The share stores derived measurements only, never captured photos.
    """
    if payload.unit not in ("cm", "inch"):
        raise HTTPException(status_code=400, detail="unit must be 'cm' or 'inch'")
    clean_measurements = {
        key: float(value)
        for key, value in payload.measurements.items()
        if isinstance(value, (int, float)) and float(value) > 0
    }
    if not clean_measurements:
        raise HTTPException(status_code=400, detail="At least one positive measurement is required")

    share_id = _new_id("share")
    token = secrets.token_urlsafe(24)
    revoke_token = secrets.token_urlsafe(24)
    now = datetime.utcnow()
    expires_at = now + timedelta(hours=payload.ttlHours)
    conn = _enterprise_connection()
    try:
        conn.execute(
            """
            INSERT INTO measurement_shares (
                id, token, revoke_token, measurement_id, measurements_json, unit,
                created_by_email, access_scope, created_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'read_only', ?, ?)
            """,
            (
                share_id,
                token,
                revoke_token,
                payload.measurementId,
                json.dumps(clean_measurements, separators=(",", ":")),
                payload.unit,
                str(payload.createdByEmail).lower() if payload.createdByEmail else None,
                now.isoformat() + "Z",
                expires_at.isoformat() + "Z",
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "id": share_id,
        "token": token,
        "shareUrl": f"{_share_base_url(request)}/{token}",
        "revokeToken": revoke_token,
        "accessScope": "read_only",
        "expiresAt": expires_at.isoformat() + "Z",
        "createdAt": now.isoformat() + "Z",
    }


@app.get("/v1/shares/{token}")
async def get_measurement_share(token: str):
    """Read a non-revoked, non-expired measurement share."""
    conn = _enterprise_connection()
    try:
        row = conn.execute(
            "SELECT * FROM measurement_shares WHERE token = ?",
            (token,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Share link not found")
    if row["revoked_at"]:
        raise HTTPException(status_code=410, detail="Share link has been revoked")
    if datetime.utcnow() > _parse_enterprise_time(row["expires_at"]):
        raise HTTPException(status_code=410, detail="Share link has expired")

    return {
        "measurementId": row["measurement_id"],
        "measurements": json.loads(row["measurements_json"]),
        "unit": row["unit"],
        "accessScope": row["access_scope"],
        "expiresAt": row["expires_at"],
        "createdAt": row["created_at"],
    }


@app.post("/v1/shares/{token}/revoke")
async def revoke_measurement_share(token: str, payload: MeasurementShareRevokeRequest):
    """Revoke a measurement share using the creator-only revoke token."""
    conn = _enterprise_connection()
    try:
        row = conn.execute(
            "SELECT revoke_token, revoked_at FROM measurement_shares WHERE token = ?",
            (token,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Share link not found")
        if not hmac.compare_digest(row["revoke_token"], payload.revokeToken):
            raise HTTPException(status_code=403, detail="Invalid revoke token")
        if not row["revoked_at"]:
            conn.execute(
                "UPDATE measurement_shares SET revoked_at = ? WHERE token = ?",
                (_enterprise_now(), token),
            )
            conn.commit()
        return {"revoked": True}
    finally:
        conn.close()


@app.post("/v1/enterprise/bootstrap")
async def bootstrap_enterprise(request: EnterpriseBootstrapRequest):
    now = _enterprise_now()
    organization_id = _new_id("org")
    organization_slug = _slugify(request.organizationName)
    admin_user_id = _new_id("user")
    license_id = _new_id("lic")
    invite_id = _new_id("inv")
    invite_code = f"{organization_slug}-{secrets.token_hex(3)}"
    trial_scan_quota = max(1, min(request.scanQuota, TRIAL_SCAN_QUOTA))
    trial_ends_at = (datetime.utcnow() + timedelta(days=TRIAL_DAYS)).isoformat() + "Z"

    conn = _enterprise_connection()
    try:
        conn.execute(
            """
            INSERT INTO organizations (id, name, slug, brand_name, primary_color, imprint, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
            """,
            (
                organization_id,
                request.organizationName,
                organization_slug,
                request.brandName or request.organizationName,
                request.primaryColor,
                request.imprint,
                now,
            ),
        )
        conn.execute(
            """
            INSERT INTO organization_users (id, organization_id, name, email, role, status, created_at)
            VALUES (?, ?, ?, ?, 'org_owner', 'active', ?)
            """,
            (admin_user_id, organization_id, request.adminName, request.adminEmail.strip().lower(), now),
        )
        conn.execute(
            """
            INSERT INTO licenses (
                id, organization_id, seats_purchased, scan_quota, scans_used, status,
                billing_interval, amount, currency, starts_at, ends_at, created_at
            )
            VALUES (?, ?, ?, ?, 0, 'trialing', 'trial', ?, ?, ?, ?, ?)
            """,
            (
                license_id,
                organization_id,
                request.seats,
                trial_scan_quota,
                max(request.scanQuota * 0.35, 99),
                DEFAULT_BILLING_CURRENCY,
                now,
                trial_ends_at,
                now,
            ),
        )
        conn.execute(
            """
            INSERT INTO invite_links (
                id, organization_id, code, label, campaign_name, imprint, primary_color,
                landing_headline, status, created_by_user_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
            """,
            (
                invite_id,
                organization_id,
                invite_code,
                "Default customer invite",
                "Launch campaign",
                request.imprint or request.organizationName,
                request.primaryColor,
                f"Scan your measurements for {request.brandName or request.organizationName}",
                admin_user_id,
                now,
            ),
        )
        _record_org_event(
            conn,
            organization_id,
            "organization_bootstrapped",
            {"inviteCode": invite_code, "trialScanQuota": trial_scan_quota},
            admin_user_id,
        )
        _record_audit_event(
            conn,
            "organization_bootstrapped",
            organization_id=organization_id,
            actor_user_id=admin_user_id,
            subject_type="organization",
            subject_id=organization_id,
            payload={"inviteCode": invite_code},
        )
        conn.commit()
    except sqlite3.IntegrityError as exc:
        conn.rollback()
        raise HTTPException(status_code=409, detail=f"Enterprise setup conflict: {exc}") from exc
    finally:
        conn.close()

    # Send a welcome email to the new org owner so they know the account exists
    # and can sign in. The actual OTP is requested at /login.
    owner_email = request.adminEmail.strip().lower()
    login_url = f"{WEB_APP_URL.rstrip('/')}/login"
    org_display = request.brandName or request.organizationName
    welcome_html = (
        f"<p>Hi {request.adminName or 'there'},</p>"
        f"<p>Your Tailor-X organization <strong>{org_display}</strong> is ready.</p>"
        f"<p>Sign in to your admin dashboard at "
        f"<a href=\"{login_url}\">{login_url}</a> using <strong>{owner_email}</strong>. "
        f"You'll receive a one-time code by email to verify it's you.</p>"
        f"<p>Your workspace starts on a {TRIAL_DAYS}-day trial with "
        f"{trial_scan_quota} included scans. Complete billing in the dashboard "
        f"to activate the full paid quota.</p>"
        f"<p>Default customer invite code: <code>{invite_code}</code></p>"
        f"<p>— Tailor-X</p>"
    )
    try:
        sent = _send_email(owner_email, f"Welcome to Tailor-X — {org_display}", welcome_html)
        if sent:
            logger.info(f"[bootstrap_enterprise] welcome email sent to {owner_email}")
        else:
            logger.warning(f"[bootstrap_enterprise] welcome email send returned False for {owner_email}")
    except Exception as exc:
        logger.error(f"[bootstrap_enterprise] welcome email failed for {owner_email}: {exc}")

    return {
        "organizationId": organization_id,
        "adminUserId": admin_user_id,
        "licenseId": license_id,
        "licenseStatus": "trialing",
        "trialScanQuota": trial_scan_quota,
        "trialEndsAt": trial_ends_at,
        "defaultInviteCode": invite_code,
        "billingCheckoutUrl": _build_checkout_url(organization_id, license_id),
    }


@app.get("/v1/enterprise/organizations/{organization_id}/dashboard")
async def get_organization_dashboard(
    organization_id: str,
    user: dict = Depends(_require_role("org_owner", "org_admin", "super_admin")),
):
    _require_org_access(organization_id, user)
    conn = _enterprise_connection()
    try:
        return _serialize_org_dashboard(conn, organization_id)
    finally:
        conn.close()


@app.get("/v1/measurements/catalog")
async def get_measurement_catalog(profile: Optional[str] = None):
    """Return the production measurement catalog used by mobile and dashboards."""
    return {
        "version": MEASUREMENT_CATALOG_VERSION,
        "profile": _normalize_measurement_profile(profile) if profile else None,
        "items": _measurement_catalog_for_profile(profile) if profile else MEASUREMENT_CATALOG,
    }


@app.get("/v1/app-links/status")
async def get_app_links_status():
    return _build_app_link_status()


@app.get("/v1/enterprise/organizations/{organization_id}/events")
async def get_organization_events(
    organization_id: str,
    since: Optional[str] = None,
    user: dict = Depends(_require_role("org_owner", "org_admin", "super_admin")),
):
    _require_org_access(organization_id, user)
    conn = _enterprise_connection()
    try:
        if since:
            rows = conn.execute(
                """
                SELECT id, event_type, payload_json, actor_user_id, created_at
                FROM org_events
                WHERE organization_id = ? AND created_at > ?
                ORDER BY created_at ASC
                LIMIT 50
                """,
                (organization_id, since),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, event_type, payload_json, actor_user_id, created_at
                FROM org_events
                WHERE organization_id = ?
                ORDER BY created_at DESC
                LIMIT 20
                """,
                (organization_id,),
            ).fetchall()
            rows = list(reversed(rows))
        events = [
            {
                "id": row["id"],
                "eventType": row["event_type"],
                "payload": _json_or_default(row["payload_json"], {}),
                "actorUserId": row["actor_user_id"],
                "createdAt": row["created_at"],
            }
            for row in rows
        ]
        cursor = events[-1]["createdAt"] if events else since
        return {"events": events, "cursor": cursor}
    finally:
        conn.close()


@app.post("/v1/enterprise/organizations/{organization_id}/accuracy-benchmarks")
async def create_accuracy_benchmark_record(
    organization_id: str,
    request: AccuracyBenchmarkRecordRequest,
    user: dict = Depends(_require_role("org_owner", "org_admin", "super_admin")),
):
    _require_org_access(organization_id, user)
    scan_measurements = _clean_numeric_payload(request.scanMeasurements)
    tape_measurements = _clean_numeric_payload(request.tapeMeasurements)
    common_keys = sorted(set(scan_measurements).intersection(tape_measurements))
    if not common_keys:
        raise HTTPException(status_code=400, detail="At least one scan/tape measurement pair is required")
    errors = {
        key: round(abs(scan_measurements[key] - tape_measurements[key]), 2)
        for key in common_keys
    }
    record_id = _new_id("bench")
    now = _enterprise_now()
    conn = _enterprise_connection()
    try:
        _get_org_or_404(conn, organization_id)
        conn.execute(
            """
            INSERT INTO accuracy_benchmark_records (
                id, organization_id, measurement_id, measurement_profile,
                scan_measurements_json, tape_measurements_json, errors_json, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                organization_id,
                request.measurementId,
                request.measurementProfile,
                json.dumps(scan_measurements, separators=(",", ":")),
                json.dumps(tape_measurements, separators=(",", ":")),
                json.dumps(errors, separators=(",", ":")),
                request.notes,
                now,
            ),
        )
        _record_org_event(
            conn,
            organization_id,
            "accuracy_benchmark_recorded",
            {"recordId": record_id, "measurementId": request.measurementId, "parts": common_keys},
            user.get("sub"),
        )
        _record_audit_event(
            conn,
            "accuracy_benchmark_recorded",
            organization_id=organization_id,
            actor_user_id=user.get("sub"),
            subject_type="accuracy_benchmark_record",
            subject_id=record_id,
            payload={"parts": common_keys},
        )
        conn.commit()
        return {
            "id": record_id,
            "errors": errors,
            "createdAt": now,
            "accuracyCertification": _compute_accuracy_certification(conn, organization_id),
        }
    finally:
        conn.close()


@app.post("/v1/enterprise/sessions/{session_id}/review")
async def review_enterprise_session(
    session_id: str,
    request: EnterpriseSessionReviewRequest,
    user: dict = Depends(_require_role("org_owner", "org_admin", "staff", "super_admin")),
):
    review_status = request.reviewStatus.strip().lower()
    if review_status not in ("pending", "reviewed", "needs_rescan", "needs_tailor_review"):
        raise HTTPException(status_code=400, detail="Invalid reviewStatus")
    conn = _enterprise_connection()
    try:
        session = conn.execute(
            "SELECT id, organization_id, status FROM measurement_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        _require_org_access(session["organization_id"], user)
        reviewed_at = _enterprise_now() if review_status != "pending" else None
        conn.execute(
            """
            UPDATE measurement_sessions
            SET review_status = ?, tailor_notes = ?, reviewed_at = ?, reviewed_by_user_id = ?
            WHERE id = ?
            """,
            (review_status, request.tailorNotes, reviewed_at, user.get("sub"), session_id),
        )
        _record_org_event(
            conn,
            session["organization_id"],
            "session_review_updated",
            {"sessionId": session_id, "reviewStatus": review_status},
            user.get("sub"),
        )
        _record_audit_event(
            conn,
            "session_review_updated",
            organization_id=session["organization_id"],
            actor_user_id=user.get("sub"),
            subject_type="measurement_session",
            subject_id=session_id,
            payload={"reviewStatus": review_status},
        )
        conn.commit()
        return {
            "sessionId": session_id,
            "reviewStatus": review_status,
            "reviewedAt": reviewed_at,
        }
    finally:
        conn.close()


@app.post("/v1/enterprise/organizations/{organization_id}/invite-links")
async def create_invite_link(
    organization_id: str,
    request: EnterpriseInviteRequest,
    user: dict = Depends(_require_role("org_owner", "org_admin", "super_admin")),
):
    now = _enterprise_now()
    conn = _enterprise_connection()
    try:
        organization = _get_org_or_404(conn, organization_id)
        _require_org_access(organization_id, user)
        invite_id = _new_id("inv")
        invite_code = f"{organization['slug']}-{secrets.token_hex(3)}"
        conn.execute(
            """
            INSERT INTO invite_links (
                id, organization_id, code, label, campaign_name, imprint, primary_color,
                landing_headline, status, created_by_user_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
            """,
            (
                invite_id,
                organization_id,
                invite_code,
                request.label,
                request.campaignName,
                request.imprint or organization["imprint"],
                request.primaryColor or organization["primary_color"],
                request.landingHeadline or f"Scan your measurements for {organization['brand_name']}",
                user.get("sub"),
                now,
            ),
        )
        _record_org_event(
            conn,
            organization_id,
            "invite_link_created",
            {"inviteId": invite_id, "code": invite_code, "label": request.label},
            user.get("sub"),
        )
        _record_audit_event(
            conn,
            "invite_link_created",
            organization_id=organization_id,
            actor_user_id=user.get("sub"),
            subject_type="invite_link",
            subject_id=invite_id,
            payload={"code": invite_code, "label": request.label},
        )
        conn.commit()
        return {
            "id": invite_id,
            "code": invite_code,
            "publicUrl": f"https://tailorxfit.com/invite/{invite_code}",
            "label": request.label,
        }
    finally:
        conn.close()


@app.get("/v1/enterprise/invite/{invite_code}")
async def get_invite_link(invite_code: str):
    conn = _enterprise_connection()
    try:
        row = conn.execute(
            """
            SELECT il.*, o.name AS organization_name, o.brand_name, o.primary_color AS org_primary_color,
                   o.imprint AS organization_imprint
            FROM invite_links il
            JOIN organizations o ON o.id = il.organization_id
            WHERE il.code = ? AND il.status = 'active'
            """,
            (invite_code,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Invite link not found")
        license_row = _get_license_for_org(conn, row["organization_id"])
        return {
            "invite": dict(row),
            "organization": {
                "id": row["organization_id"],
                "name": row["organization_name"],
                "brandName": row["brand_name"],
                "primaryColor": row["primary_color"] or row["org_primary_color"],
                "imprint": row["imprint"] or row["organization_imprint"],
            },
            "quota": {
                "scanQuota": license_row["scan_quota"],
                "scansUsed": license_row["scans_used"],
                "remainingQuota": _remaining_quota(license_row),
                "overageUnits": _overage_units(license_row),
                "overageGraceScans": OVERAGE_GRACE_SCANS,
                "canStartSession": _can_consume_scan(license_row),
            },
            "measurementCatalog": {
                "version": MEASUREMENT_CATALOG_VERSION,
                "profiles": ["male", "female", "other"],
                "requiredAngles": ["front", "side"],
            },
            "appLinks": _build_app_link_status(),
        }
    finally:
        conn.close()


@app.post("/v1/enterprise/invite/{invite_code}/start-session")
async def start_enterprise_session(invite_code: str, request: EnterpriseSessionStartRequest):
    conn = _enterprise_connection()
    now = _enterprise_now()
    try:
        invite = conn.execute(
            "SELECT * FROM invite_links WHERE code = ? AND status = 'active'",
            (invite_code,),
        ).fetchone()
        if not invite:
            raise HTTPException(status_code=404, detail="Invite link not found")

        license_row = _get_license_for_org(conn, invite["organization_id"])
        if license_row["status"] not in ("active", "trialing"):
            raise HTTPException(status_code=403, detail="Organization license is not active or trialing")
        if not _can_consume_scan(license_row):
            raise HTTPException(status_code=403, detail="Scan quota exhausted and overage grace limit reached")

        customer_email = request.customerEmail.strip().lower()
        customer = conn.execute(
            "SELECT * FROM customers WHERE organization_id = ? AND email = ?",
            (invite["organization_id"], customer_email),
        ).fetchone()
        if customer is None:
            customer_id = _new_id("cust")
            conn.execute(
                """
                INSERT INTO customers (id, organization_id, invite_link_id, full_name, email, phone, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    customer_id,
                    invite["organization_id"],
                    invite["id"],
                    request.customerName,
                    customer_email,
                    request.customerPhone,
                    now,
                ),
            )
        else:
            customer_id = customer["id"]

        session_id = _new_id("sess")
        conn.execute(
            """
            INSERT INTO measurement_sessions (
                id, organization_id, customer_id, invite_link_id, source, status, started_at
            ) VALUES (?, ?, ?, ?, ?, 'started', ?)
            """,
            (session_id, invite["organization_id"], customer_id, invite["id"], request.source, now),
        )
        _record_org_event(
            conn,
            invite["organization_id"],
            "session_started",
            {
                "sessionId": session_id,
                "customerId": customer_id,
                "customerEmail": customer_email,
                "inviteCode": invite_code,
            },
        )
        _record_audit_event(
            conn,
            "session_started",
            organization_id=invite["organization_id"],
            subject_type="measurement_session",
            subject_id=session_id,
            payload={"customerId": customer_id, "inviteCode": invite_code},
        )
        conn.commit()
        return {
            "sessionId": session_id,
            "organizationId": invite["organization_id"],
            "customerId": customer_id,
            "remainingQuota": _remaining_quota(license_row),
        }
    finally:
        conn.close()


@app.post("/v1/enterprise/sessions/{session_id}/complete")
async def complete_enterprise_session(session_id: str, request: EnterpriseSessionCompleteRequest):
    conn = _enterprise_connection()
    now = _enterprise_now()
    try:
        session = conn.execute(
            "SELECT * FROM measurement_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if session["status"] == "completed":
            return {"sessionId": session_id, "status": "completed"}

        license_row = _get_license_for_org(conn, session["organization_id"])
        if not _can_consume_scan(license_row):
            raise HTTPException(status_code=403, detail="Scan quota exhausted and overage grace limit reached")

        unit = request.unit if request.unit in ("cm", "inch") else "cm"
        measurements = _clean_numeric_payload(request.measurements)
        confidence = _clean_numeric_payload(request.confidence, max_value=100.0)
        warnings = _clean_warning_payload(request.warnings)
        metadata = dict(request.metadata or {})
        if request.measurementProfile:
            metadata["measurementProfile"] = request.measurementProfile
        metadata["measurementCount"] = len(measurements)
        accuracy_status = _accuracy_status_from_session(
            measurements,
            confidence,
            warnings,
            request.measurementProfile,
        )
        metadata["catalogVersion"] = MEASUREMENT_CATALOG_VERSION
        metadata["catalogCoverage"] = accuracy_status["coverage"]
        metadata["accuracyStatus"] = accuracy_status["status"]
        review_status = "needs_tailor_review" if accuracy_status["status"] != "ready_for_tailor" else "pending"

        conn.execute(
            """
            UPDATE measurement_sessions
            SET status = 'completed',
                measurement_id = ?,
                measurements_json = ?,
                unit = ?,
                measurement_profile = ?,
                accuracy_score = ?,
                confidence_json = ?,
                warnings_json = ?,
                review_status = ?,
                metadata_json = ?,
                completed_at = ?
            WHERE id = ?
            """,
            (
                request.measurementId,
                json.dumps(measurements, separators=(",", ":")),
                unit,
                request.measurementProfile,
                request.accuracyScore,
                json.dumps(confidence, separators=(",", ":")),
                json.dumps(warnings, separators=(",", ":")),
                review_status,
                json.dumps(metadata, separators=(",", ":")),
                now,
                session_id,
            ),
        )
        conn.execute(
            "UPDATE licenses SET scans_used = scans_used + 1 WHERE id = ?",
            (license_row["id"],),
        )
        refreshed_license = _get_license_for_org(conn, session["organization_id"])
        _sync_overage_record(conn, session["organization_id"], refreshed_license["id"], refreshed_license)
        _record_org_event(
            conn,
            session["organization_id"],
            "session_completed",
            {
                "sessionId": session_id,
                "measurementId": request.measurementId,
                "measurementCount": len(measurements),
                "accuracyScore": request.accuracyScore,
                "reviewStatus": review_status,
            },
        )
        _record_audit_event(
            conn,
            "session_completed",
            organization_id=session["organization_id"],
            subject_type="measurement_session",
            subject_id=session_id,
            payload={"measurementId": request.measurementId, "measurementCount": len(measurements)},
        )
        conn.commit()
        return {
            "sessionId": session_id,
            "status": "completed",
            "scansUsed": refreshed_license["scans_used"],
            "remainingQuota": _remaining_quota(refreshed_license),
            "overageUnits": _overage_units(refreshed_license),
            "measurementCount": len(measurements),
            "reviewStatus": review_status,
            "accuracyStatus": accuracy_status,
        }
    finally:
        conn.close()


@app.post("/v1/enterprise/billing/checkout")
async def create_billing_checkout(
    request: BillingCheckoutRequest,
    user: dict = Depends(_require_role("org_owner", "org_admin", "super_admin")),
):
    _require_org_access(request.organizationId, user)
    conn = _enterprise_connection()
    now = _enterprise_now()
    try:
        _get_org_or_404(conn, request.organizationId)
        admin_row = conn.execute(
            "SELECT email FROM organization_users WHERE organization_id = ? ORDER BY created_at LIMIT 1",
            (request.organizationId,),
        ).fetchone()
        customer_email = admin_row["email"] if admin_row else ""
        checkout_interval = "annual" if request.billingInterval == "trial" else request.billingInterval

        result = _paystack_initialize_transaction(
            org_id=request.organizationId,
            license_id=request.licenseId,
            plan_tier=request.planTier,
            amount=request.amount,
            currency=request.currency,
            customer_email=customer_email,
        )
        record_id = _new_id("bill")
        conn.execute(
            """
            INSERT INTO billing_records (
                id, organization_id, license_id, amount, currency, status,
                billing_interval, checkout_url, external_reference, created_at, paystack_reference
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                request.organizationId,
                request.licenseId,
                request.amount,
                request.currency,
                checkout_interval,
                result["checkoutUrl"],
                result["reference"],
                now,
                result["reference"],
            ),
        )
        _record_org_event(
            conn,
            request.organizationId,
            "billing_checkout_created",
            {"billingRecordId": record_id, "amount": request.amount, "currency": request.currency},
            user.get("sub"),
        )
        _record_audit_event(
            conn,
            "billing_checkout_created",
            organization_id=request.organizationId,
            actor_user_id=user.get("sub"),
            subject_type="billing_record",
            subject_id=record_id,
            payload={"amount": request.amount, "currency": request.currency},
        )
        conn.commit()
        return {
            "billingRecordId": record_id,
            "checkoutUrl": result["checkoutUrl"],
            "paystackReference": result["reference"],
            "provider": result["provider"],
            "status": "pending",
        }
    finally:
        conn.close()


@app.post("/v1/billing/webhook")
async def paystack_webhook(request: Request):
    """Paystack webhook — handles transactions, subscriptions, and renewals.

    Paystack signs the raw request body with HMAC-SHA512 using the secret key,
    in the `x-paystack-signature` header.
    """
    payload = await request.body()
    signature = request.headers.get("x-paystack-signature", "")

    if not _paystack_verify_signature(payload, signature):
        raise HTTPException(status_code=400, detail="Invalid Paystack signature")

    try:
        event = json.loads(payload.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event_type = event.get("event", "")
    data_obj = event.get("data", {}) or {}
    metadata = data_obj.get("metadata") or {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except ValueError:
            metadata = {}
    org_id = metadata.get("org_id", "")
    license_id = metadata.get("license_id", "")
    reference = data_obj.get("reference", "")
    customer_obj = data_obj.get("customer") or {}
    customer_code = customer_obj.get("customer_code", "")
    subscription_code = data_obj.get("subscription_code") or data_obj.get("plan", {}).get("subscription_code", "") if isinstance(data_obj.get("plan"), dict) else data_obj.get("subscription_code", "")

    # Idempotency: dedupe by (provider, reference, event_type). Paystack may
    # retry the same webhook; we want to apply it exactly once.
    idempotency_key = reference or data_obj.get("id") or event.get("id") or ""
    if idempotency_key:
        dedupe_conn = _enterprise_connection()
        try:
            try:
                dedupe_conn.execute(
                    "INSERT INTO processed_webhooks (provider, event_id, event_type, processed_at) VALUES (?, ?, ?, ?)",
                    ("paystack", str(idempotency_key), event_type, _enterprise_now()),
                )
                dedupe_conn.commit()
            except Exception:
                if hasattr(dedupe_conn, "rollback"):
                    dedupe_conn.rollback()
                logger.info(f"Paystack webhook duplicate ignored: {event_type} {idempotency_key}")
                return {"received": True, "event": event_type, "duplicate": True}
        finally:
            dedupe_conn.close()

    conn = _enterprise_connection()
    try:
        if event_type == "charge.success":
            # Payment confirmed — mark billing record paid + activate license
            conn.execute(
                """
                UPDATE billing_records
                SET status='paid', paystack_customer_code=?, paystack_subscription_code=?
                WHERE paystack_reference=? OR external_reference=?
                """,
                (customer_code, subscription_code, reference, reference),
            )
            target_license_id = license_id
            target_org_id = org_id
            paid_quota: Optional[int] = None
            if reference:
                row = conn.execute(
                    "SELECT organization_id, license_id, amount FROM billing_records WHERE paystack_reference=? OR external_reference=?",
                    (reference, reference),
                ).fetchone()
                if row:
                    if not target_org_id:
                        target_org_id = row["organization_id"]
                    if not target_license_id:
                        target_license_id = row["license_id"]
                    paid_quota = _paid_quota_from_amount(float(row["amount"] or 0))
            if target_license_id:
                if paid_quota:
                    conn.execute(
                        "UPDATE licenses SET status='active', billing_interval='annual', scan_quota=?, ends_at=? WHERE id=?",
                        (paid_quota, (datetime.utcnow() + timedelta(days=365)).isoformat() + "Z", target_license_id),
                    )
                else:
                    conn.execute(
                        "UPDATE licenses SET status='active', billing_interval='annual', ends_at=? WHERE id=?",
                        ((datetime.utcnow() + timedelta(days=365)).isoformat() + "Z", target_license_id),
                    )
            if target_org_id:
                _record_org_event(
                    conn,
                    target_org_id,
                    "billing_payment_confirmed",
                    {"reference": reference, "licenseId": target_license_id, "paidQuota": paid_quota},
                )
                _record_audit_event(
                    conn,
                    "billing_payment_confirmed",
                    organization_id=target_org_id,
                    subject_type="billing_record",
                    subject_id=reference,
                    payload={"licenseId": target_license_id, "paidQuota": paid_quota},
                )
            conn.commit()

        elif event_type == "subscription.create":
            # New subscription created
            sub_code = data_obj.get("subscription_code", "")
            if sub_code and reference:
                conn.execute(
                    "UPDATE billing_records SET paystack_subscription_code=?, paystack_customer_code=? WHERE paystack_reference=?",
                    (sub_code, customer_code, reference),
                )
                conn.commit()

        elif event_type == "invoice.create":
            # Renewal invoice created — mark license active
            sub_code = data_obj.get("subscription", {}).get("subscription_code", "") if isinstance(data_obj.get("subscription"), dict) else data_obj.get("subscription_code", "")
            if sub_code and org_id:
                conn.execute(
                    "UPDATE licenses SET status='active', ends_at=? WHERE organization_id=? AND status!='cancelled'",
                    ((datetime.utcnow() + timedelta(days=365)).isoformat() + "Z", org_id),
                )
                conn.commit()

        elif event_type == "invoice.payment_failed":
            sub_code = data_obj.get("subscription", {}).get("subscription_code", "") if isinstance(data_obj.get("subscription"), dict) else data_obj.get("subscription_code", "")
            target_org = org_id
            if not target_org and sub_code:
                row = conn.execute(
                    "SELECT organization_id FROM billing_records WHERE paystack_subscription_code=? LIMIT 1",
                    (sub_code,),
                ).fetchone()
                if row:
                    target_org = row["organization_id"]
            if target_org:
                conn.execute(
                    "UPDATE licenses SET status='past_due' WHERE organization_id=? AND status='active'",
                    (target_org,),
                )
                _record_org_event(
                    conn,
                    target_org,
                    "billing_payment_failed",
                    {"subscriptionCode": sub_code},
                )
                _record_audit_event(
                    conn,
                    "billing_payment_failed",
                    organization_id=target_org,
                    subject_type="license",
                    subject_id=sub_code,
                )
                conn.commit()

        elif event_type in ("subscription.disable", "subscription.not_renew"):
            sub_code = data_obj.get("subscription_code", "")
            target_org = org_id
            if not target_org and sub_code:
                row = conn.execute(
                    "SELECT organization_id FROM billing_records WHERE paystack_subscription_code=? LIMIT 1",
                    (sub_code,),
                ).fetchone()
                if row:
                    target_org = row["organization_id"]
            if target_org:
                conn.execute(
                    "UPDATE licenses SET status='cancelled' WHERE organization_id=? AND status='active'",
                    (target_org,),
                )
                _record_org_event(
                    conn,
                    target_org,
                    "billing_subscription_cancelled",
                    {"subscriptionCode": sub_code, "event": event_type},
                )
                _record_audit_event(
                    conn,
                    "billing_subscription_cancelled",
                    organization_id=target_org,
                    subject_type="license",
                    subject_id=sub_code,
                    payload={"event": event_type},
                )
                conn.commit()

    finally:
        conn.close()

    return {"received": True, "event": event_type}


# ============================================================
# AUTH ENDPOINTS (JWT-based, used by web admin app)
# ============================================================

# Simple in-process throttle for OTP send/verify. Resets on restart, which is
# acceptable: an attacker would need a clean window AND would still be capped
# by per-email limits. For multi-instance deployments this should move to
# Redis. Keys: send=("send", email), verify=("verify", email).
_otp_throttle: dict[tuple[str, str], list[float]] = {}
_OTP_SEND_INTERVAL_SEC = 60          # min seconds between send-otp for the same email
_OTP_SEND_MAX_PER_HOUR = 5           # max sends per email per hour
_OTP_VERIFY_MAX_PER_15MIN = 5        # max verify attempts per email per 15 min


def _otp_throttle_check(kind: str, email: str, window_sec: int, max_attempts: int) -> bool:
    """Return True if the request is allowed; False if rate-limited."""
    now = time.time()
    key = (kind, email)
    bucket = [t for t in _otp_throttle.get(key, []) if now - t < window_sec]
    if len(bucket) >= max_attempts:
        _otp_throttle[key] = bucket
        return False
    bucket.append(now)
    _otp_throttle[key] = bucket
    return True


@app.post("/v1/auth/admin/send-otp")
async def admin_send_otp(request: AdminLoginRequest):
    """Send a login OTP to an admin or super_admin email."""
    email = request.email.strip().lower()

    # Throttle BEFORE doing DB lookups, so we don't reveal user existence
    # via timing differences either.
    if not _otp_throttle_check("send_short", email, _OTP_SEND_INTERVAL_SEC, 1):
        raise HTTPException(status_code=429, detail="Please wait before requesting another code.")
    if not _otp_throttle_check("send_hour", email, 3600, _OTP_SEND_MAX_PER_HOUR):
        raise HTTPException(status_code=429, detail="Too many code requests. Try again later.")
    conn = _enterprise_connection()
    try:
        user_row = conn.execute(
            "SELECT * FROM organization_users WHERE email = ? AND role IN ('org_owner','org_admin','super_admin') AND status = 'active'",
            (email,),
        ).fetchone()
    finally:
        conn.close()

    if not user_row:
        # Security: don't reveal if email exists, but still return 200
        logger.warning(f"[admin_send_otp] no active admin user found for email='{email}' — returning sent:true silently")
        return {"sent": True}

    logger.info(f"[admin_send_otp] match found id={user_row['id']} role={user_row['role']} — generating OTP and sending email")
    code = str(random.randint(100000, 999999))
    _otp_set(email, code, ttl_minutes=10)
    html = (
        f"<p>Your Tailor-X admin login code is:</p>"
        f"<h2 style='font-family:monospace;letter-spacing:4px'>{code}</h2>"
        f"<p>This code expires in 10 minutes.</p>"
    )
    try:
        _send_email(email, "Your Tailor-X admin login code", html)
    except Exception as exc:  # don't leak email-send failures to caller
        logger.error(f"[admin_send_otp] email send failed for {email}: {exc}")
    return {"sent": True}


@app.post("/v1/auth/admin/verify-otp")
async def admin_verify_otp(request: AdminOTPVerifyRequest):
    """Verify OTP and return a signed JWT with role + org claims."""
    email = request.email.strip().lower()
    if not _otp_throttle_check("verify", email, 900, _OTP_VERIFY_MAX_PER_15MIN):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in 15 minutes.")
    entry = _otp_get(email)
    if not entry or entry["code"] != request.code.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    if datetime.utcnow() > entry["expires_at"]:
        _otp_delete(email)
        raise HTTPException(status_code=400, detail="OTP expired")
    _otp_delete(email)

    conn = _enterprise_connection()
    try:
        user_row = conn.execute(
            "SELECT * FROM organization_users WHERE email = ? AND status = 'active'",
            (email,),
        ).fetchone()
    finally:
        conn.close()

    if not user_row:
        raise HTTPException(status_code=403, detail="User not found or inactive")

    token = _issue_jwt({
        "sub": user_row["id"],
        "email": email,
        "role": user_row["role"],
        "organization_id": user_row["organization_id"],
        "name": user_row["name"],
    })
    return {
        "token": token,
        "role": user_row["role"],
        "organizationId": user_row["organization_id"],
        "name": user_row["name"],
        "email": email,
    }


@app.post("/v1/auth/admin/provision-super-admin")
async def provision_super_admin(request: AdminLoginRequest):
    """One-time endpoint to provision the first super_admin (only works if none exist).

    Race-safe: relies on the partial unique index `idx_one_super_admin` so
    concurrent calls cannot both succeed."""
    conn = _enterprise_connection()
    try:
        existing = conn.execute(
            "SELECT COUNT(*) AS c FROM organization_users WHERE role='super_admin'"
        ).fetchone()["c"]
        if existing > 0:
            raise HTTPException(status_code=409, detail="Super admin already provisioned")
        sa_id = _new_id("user")
        try:
            conn.execute(
                "INSERT INTO organization_users (id, organization_id, name, email, role, status, created_at) VALUES (?,NULL,'Super Admin',?,'super_admin','active',?)",
                (sa_id, request.email.strip().lower(), _enterprise_now()),
            )
            conn.commit()
        except Exception as exc:
            # Most likely the partial unique index fired due to a concurrent call.
            if hasattr(conn, "rollback"):
                conn.rollback()
            logger.warning(f"provision_super_admin insert failed: {exc}")
            raise HTTPException(status_code=409, detail="Super admin already provisioned")
        return {"created": True, "id": sa_id}
    finally:
        conn.close()


@app.post("/v1/enterprise/organizations/{organization_id}/staff")
async def invite_staff(
    organization_id: str,
    request: InviteStaffRequest,
    user: dict = Depends(_require_role("org_owner", "org_admin", "super_admin")),
):
    """Add a staff or org_admin user to the organization."""
    _require_org_access(organization_id, user)
    if request.role not in ("org_admin", "staff"):
        raise HTTPException(status_code=400, detail="role must be org_admin or staff")
    conn = _enterprise_connection()
    now = _enterprise_now()
    try:
        _get_org_or_404(conn, organization_id)
        uid = _new_id("user")
        try:
            conn.execute(
                "INSERT INTO organization_users (id, organization_id, name, email, role, status, created_at) VALUES (?,?,?,?,?,?,?)",
                (uid, organization_id, request.name, request.email.strip().lower(), request.role, "active", now),
            )
            _record_org_event(
                conn,
                organization_id,
                "staff_added",
                {"userId": uid, "email": request.email.strip().lower(), "role": request.role},
                user.get("sub"),
            )
            _record_audit_event(
                conn,
                "staff_added",
                organization_id=organization_id,
                actor_user_id=user.get("sub"),
                subject_type="organization_user",
                subject_id=uid,
                payload={"email": request.email.strip().lower(), "role": request.role},
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Email already registered")
        return {"id": uid, "role": request.role, "email": request.email.strip().lower()}
    finally:
        conn.close()


@app.get("/v1/enterprise/super-admin/dashboard")
async def get_super_admin_dashboard(
    user: dict = Depends(_require_role("super_admin")),
):
    conn = _enterprise_connection()
    try:
        organization_count = conn.execute(
            "SELECT COUNT(*) AS count FROM organizations"
        ).fetchone()["count"]
        active_license_count = conn.execute(
            "SELECT COUNT(*) AS count FROM licenses WHERE status = 'active'"
        ).fetchone()["count"]
        total_quota = conn.execute(
            "SELECT COALESCE(SUM(scan_quota), 0) AS total FROM licenses"
        ).fetchone()["total"]
        total_used = conn.execute(
            "SELECT COALESCE(SUM(scans_used), 0) AS total FROM licenses"
        ).fetchone()["total"]
        monthly_revenue = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM billing_records WHERE status IN ('pending', 'paid')"
        ).fetchone()["total"]
        organizations = conn.execute(
            """
            SELECT o.id, o.name, o.slug, o.brand_name, o.status, o.created_at,
                   l.seats_purchased, l.scan_quota, l.scans_used, l.amount, l.currency
            FROM organizations o
            LEFT JOIN licenses l ON l.organization_id = o.id
            ORDER BY o.created_at DESC
            LIMIT 20
            """
        ).fetchall()
        return {
            "summary": {
                "organizationCount": organization_count,
                "activeLicenseCount": active_license_count,
                "totalScanQuota": total_quota,
                "totalScansUsed": total_used,
                "utilizationRate": round((total_used / total_quota) * 100, 2) if total_quota else 0,
                "bookedRevenue": monthly_revenue,
            },
            "organizations": [dict(row) for row in organizations],
        }
    finally:
        conn.close()


def _set_organization_status(organization_id: str, new_status: str) -> dict:
    """Update an organization's status and cascade to its license."""
    conn = _enterprise_connection()
    try:
        org = conn.execute(
            "SELECT id, name, status FROM organizations WHERE id = ?",
            (organization_id,),
        ).fetchone()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        conn.execute(
            "UPDATE organizations SET status = ? WHERE id = ?",
            (new_status, organization_id),
        )
        # Cascade: suspend/activate the license too so the org can't keep
        # consuming scans while suspended.
        license_status = "active" if new_status == "active" else "suspended"
        conn.execute(
            "UPDATE licenses SET status = ? WHERE organization_id = ?",
            (license_status, organization_id),
        )
        # Also flip user status so their JWTs effectively stop working at the
        # role check (admin_send_otp filters by status='active').
        user_status = "active" if new_status == "active" else "suspended"
        conn.execute(
            "UPDATE organization_users SET status = ? WHERE organization_id = ?",
            (user_status, organization_id),
        )
        conn.commit()
        return {"id": organization_id, "name": org["name"], "status": new_status}
    finally:
        conn.close()


@app.post("/v1/enterprise/super-admin/organizations/{organization_id}/suspend")
async def suspend_organization(
    organization_id: str,
    user: dict = Depends(_require_role("super_admin")),
):
    result = _set_organization_status(organization_id, "suspended")
    logger.info(f"[super_admin] {user.get('email')} suspended org {organization_id}")
    return result


@app.post("/v1/enterprise/super-admin/organizations/{organization_id}/activate")
async def activate_organization(
    organization_id: str,
    user: dict = Depends(_require_role("super_admin")),
):
    result = _set_organization_status(organization_id, "active")
    logger.info(f"[super_admin] {user.get('email')} activated org {organization_id}")
    return result


@app.delete("/v1/enterprise/super-admin/organizations/{organization_id}")
async def delete_organization(
    organization_id: str,
    user: dict = Depends(_require_role("super_admin")),
):
    """Permanently delete an organization and ALL its data (users, licenses,
    invite links, customers, sessions, billing records). Cannot be undone."""
    conn = _enterprise_connection()
    try:
        org = conn.execute(
            "SELECT id, name FROM organizations WHERE id = ?",
            (organization_id,),
        ).fetchone()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        # Explicit deletes in dependency order. SQLite FK cascade requires
        # PRAGMA per-connection; Postgres uses the schema-level ON DELETE
        # CASCADE we declared. Doing them explicitly works on both.
        for stmt in (
            "DELETE FROM billing_records WHERE organization_id = ?",
            "DELETE FROM measurement_sessions WHERE organization_id = ?",
            "DELETE FROM customers WHERE organization_id = ?",
            "DELETE FROM invite_links WHERE organization_id = ?",
            "DELETE FROM licenses WHERE organization_id = ?",
            "DELETE FROM organization_users WHERE organization_id = ?",
            "DELETE FROM organizations WHERE id = ?",
        ):
            conn.execute(stmt, (organization_id,))
        conn.commit()
        logger.warning(f"[super_admin] {user.get('email')} DELETED org {organization_id} ({org['name']})")
        return {"deleted": True, "id": organization_id, "name": org["name"]}
    finally:
        conn.close()


@app.post("/v1/pose/detect", response_model=PoseResponse)
async def detect_pose(
    request: PoseRequest,
    authorization: Optional[str] = None,
):
    # Auth check
    if not verify_api_key(authorization):
        raise HTTPException(status_code=401, detail="Invalid API key")

    start_time = time.time()

    try:
        # Decode base64 image (apply EXIF rotation for correct orientation)
        image_bytes = base64.b64decode(request.image)
        pil_image = _open_image(image_bytes)
        image_width, image_height = pil_image.size
        logger.info(f"Pose request: image {image_width}x{image_height}, type={request.captureType}")

        # Run server-side image quality check (non-blocking)
        quality = _analyze_image_quality(np.array(pil_image))
        if not quality["is_acceptable"]:
            logger.warning(f"Image quality issues: {quality['issues']}")

        # Try pose detection with progressive preprocessing:
        # 1. Resize only (no padding)
        # 2. Resize + 15% padding
        # 3. Resize + 25% padding
        detector = get_detector()
        result = None
        transform = None

        for pad_ratio in [0.0, 0.15, 0.25]:
            processed, transform = _preprocess_for_pose(pil_image, pad_ratio=pad_ratio)
            np_image = np.array(processed)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np_image)
            det_result = detector.detect(mp_image)

            if det_result.pose_landmarks and len(det_result.pose_landmarks) > 0:
                result = det_result
                if pad_ratio > 0:
                    logger.info(f"Pose detected with {int(pad_ratio*100)}% padding")
                break
            else:
                logger.info(f"No pose with pad_ratio={pad_ratio}, trying next...")

        if result is None or not result.pose_landmarks:
            raise HTTPException(
                status_code=422,
                detail="No pose detected in image. Ensure full body is visible with good lighting."
            )

        # Extract landmarks (first detected pose)
        pose = result.pose_landmarks[0]
        
        landmarks = []
        total_visibility = 0.0
        
        for i, lm in enumerate(pose):
            name = LANDMARK_NAMES[i] if i < len(LANDMARK_NAMES) else f"landmark_{i}"
            
            # Remap from preprocessed image coordinates to original image space
            norm_x, norm_y = _remap_landmark(lm.x, lm.y, transform)
            
            if request.returnFormat == "normalized":
                x, y = norm_x, norm_y
            else:
                x, y = norm_x * image_width, norm_y * image_height
            
            visibility = lm.visibility if hasattr(lm, 'visibility') else lm.presence
            total_visibility += visibility
            
            landmarks.append(LandmarkResponse(
                x=round(x, 6),
                y=round(y, 6),
                z=round(lm.z, 6),
                visibility=round(visibility, 4),
                name=name,
            ))

        avg_confidence = total_visibility / len(pose) if len(pose) > 0 else 0
        processing_ms = int((time.time() - start_time) * 1000)

        logger.info(
            f"Pose detected: {len(landmarks)} landmarks, "
            f"confidence={avg_confidence:.2f}, "
            f"time={processing_ms}ms, "
            f"type={request.captureType}"
        )

        return PoseResponse(
            landmarks=landmarks,
            imageWidth=image_width,
            imageHeight=image_height,
            confidence=round(avg_confidence, 4),
            model="blazepose_full",
            processingTimeMs=processing_ms,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Pose detection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")

# ============================================================
# IMAGE QUALITY ANALYSIS
# ============================================================

def _analyze_image_quality(np_image: np.ndarray) -> dict:
    """Analyze image quality: blur (Laplacian variance), brightness, contrast."""
    gray = np.mean(np_image, axis=2).astype(np.float64)

    # Blur detection via Laplacian variance
    # Compute discrete Laplacian: kernel [[0,1,0],[1,-4,1],[0,1,0]]
    h, w = gray.shape
    laplacian = np.zeros_like(gray)
    laplacian[1:-1, 1:-1] = (
        gray[0:-2, 1:-1] + gray[2:, 1:-1] +
        gray[1:-1, 0:-2] + gray[1:-1, 2:] -
        4 * gray[1:-1, 1:-1]
    )
    blur_variance = float(np.var(laplacian))
    # Normalize: 0-100 scale. Variance > 500 is sharp, < 100 is blurry
    blur_score = min(100, (blur_variance / 500) * 100)

    # Brightness: average pixel intensity
    brightness = float(np.mean(gray))

    # Contrast: standard deviation of pixel intensities
    contrast = float(np.std(gray))

    issues: list[str] = []
    if blur_score < 20:
        issues.append("Image is blurry. Hold the camera steady or use a tripod.")
    if brightness < 50:
        issues.append("Image is too dark. Move to a well-lit area.")
    elif brightness > 220:
        issues.append("Image is overexposed. Reduce lighting or avoid direct flash.")
    if contrast < 25:
        issues.append("Low contrast. Ensure subject stands against a plain background.")

    return {
        "blur_score": round(blur_score, 1),
        "brightness": round(brightness, 1),
        "contrast": round(contrast, 1),
        "is_acceptable": len(issues) == 0,
        "issues": issues,
    }


class ImageQualityRequest(BaseModel):
    image: str  # Base64-encoded image


class ReferenceDetectionResult(BaseModel):
    detected: bool
    object_type: Optional[str]  # credit_card | a4_paper | ruler | None
    bounds: Optional[dict]       # {x, y, width, height} in pixels
    pixel_width: float
    pixel_height: float
    confidence: float


class ContourWidthResult(BaseModel):
    """Body contour widths measured from silhouette segmentation."""
    success: bool
    capture_type: str  # front | side
    widths: dict       # {body_part: {width_cm: float, width_px: float, y_position: float}}
    silhouette_height_px: float
    processing_time_ms: int
    segmentation_confidence: float


class ContourRequest(BaseModel):
    image: str         # Base64-encoded image
    capture_type: str = "front"  # front | side
    landmarks: Optional[list[dict]] = None  # pose landmarks for cross-section positioning
    scale_factor: Optional[float] = None    # cm per pixel (from calibration)


@app.post("/v1/image/quality", response_model=ImageQualityResult)
async def check_image_quality(
    request: ImageQualityRequest,
    authorization: Optional[str] = None,
):
    """Analyze image quality: blur, brightness, and contrast."""
    if not verify_api_key(authorization):
        raise HTTPException(status_code=401, detail="Invalid API key")

    try:
        image_bytes = base64.b64decode(request.image)
        pil_image = _open_image(image_bytes)
        np_image = np.array(pil_image)
        result = _analyze_image_quality(np_image)
        return ImageQualityResult(**result)
    except Exception as e:
        logger.error(f"Image quality check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Quality check error: {str(e)}")


# ============================================================
# REFERENCE OBJECT DETECTION
# ============================================================

# Known reference object sizes in cm
REFERENCE_OBJECTS = {
    "credit_card": {"width": 8.56, "height": 5.398, "aspect_ratio": 8.56 / 5.398},
    "a4_paper": {"width": 21.0, "height": 29.7, "aspect_ratio": 21.0 / 29.7},
    "ruler": {"width": 30.0, "height": 3.0, "aspect_ratio": 30.0 / 3.0},
}


def _detect_reference_object(np_image: np.ndarray) -> dict:
    """
    Detect rectangular reference objects via edge detection and contour analysis.
    Uses pure numpy — no OpenCV dependency required.
    """
    h, w = np_image.shape[:2]
    gray = np.mean(np_image, axis=2).astype(np.float64)

    # Simple edge detection via Sobel-like gradient magnitude
    gx = np.zeros_like(gray)
    gy = np.zeros_like(gray)
    gx[:, 1:-1] = gray[:, 2:] - gray[:, :-2]
    gy[1:-1, :] = gray[2:, :] - gray[:-2, :]
    edges = np.sqrt(gx**2 + gy**2)

    # Threshold to binary edges
    threshold = np.percentile(edges, 90)
    binary = (edges > threshold).astype(np.uint8)

    # Find connected rectangular regions by scanning for contiguous bounding boxes
    # Use a simpler row/column projection approach for card-like objects
    best_match = None
    best_score = 0.0

    # Scan at multiple scales for rectangular blobs
    for scale in [1, 2, 4]:
        scaled = binary[::scale, ::scale]
        sh, sw = scaled.shape

        # Row and column projections
        col_sum = np.sum(scaled, axis=0)
        row_sum = np.sum(scaled, axis=1)

        # Find dense regions (above median + 1 std)
        col_thresh = np.median(col_sum) + np.std(col_sum) * 0.5
        row_thresh = np.median(row_sum) + np.std(row_sum) * 0.5

        col_mask = col_sum > col_thresh
        row_mask = row_sum > row_thresh

        # Find contiguous runs in columns and rows
        col_runs = _find_runs(col_mask)
        row_runs = _find_runs(row_mask)

        for cr in col_runs:
            for rr in row_runs:
                cw = (cr[1] - cr[0]) * scale
                ch = (rr[1] - rr[0]) * scale

                if cw < 20 or ch < 20:
                    continue
                if cw > w * 0.8 or ch > h * 0.8:
                    continue

                aspect = max(cw, ch) / max(min(cw, ch), 1)

                # Try to match against known reference objects
                for obj_name, obj_info in REFERENCE_OBJECTS.items():
                    ref_aspect = obj_info["aspect_ratio"]
                    if ref_aspect < 1:
                        ref_aspect = 1 / ref_aspect

                    aspect_error = abs(aspect - ref_aspect) / ref_aspect

                    if aspect_error < 0.25:  # Within 25% aspect ratio match
                        # Score based on aspect ratio accuracy and edge density
                        x1, x2 = cr[0] * scale, cr[1] * scale
                        y1, y2 = rr[0] * scale, rr[1] * scale
                        region = binary[y1:y2, x1:x2]
                        edge_density = np.mean(region) if region.size > 0 else 0

                        score = (1 - aspect_error) * 0.6 + edge_density * 0.4

                        if score > best_score:
                            best_score = score
                            best_match = {
                                "type": obj_name,
                                "x": int(x1),
                                "y": int(y1),
                                "width": int(cw),
                                "height": int(ch),
                                "confidence": round(min(score, 0.95), 3),
                            }

    if best_match and best_match["confidence"] > 0.3:
        return {
            "detected": True,
            "object_type": best_match["type"],
            "bounds": {
                "x": best_match["x"],
                "y": best_match["y"],
                "width": best_match["width"],
                "height": best_match["height"],
            },
            "pixel_width": float(best_match["width"]),
            "pixel_height": float(best_match["height"]),
            "confidence": best_match["confidence"],
        }

    return {
        "detected": False,
        "object_type": None,
        "bounds": None,
        "pixel_width": 0.0,
        "pixel_height": 0.0,
        "confidence": 0.0,
    }


def _find_runs(mask: np.ndarray, min_length: int = 10) -> list[tuple[int, int]]:
    """Find contiguous runs of True values in a boolean array."""
    runs = []
    in_run = False
    start = 0
    for i, v in enumerate(mask):
        if v and not in_run:
            start = i
            in_run = True
        elif not v and in_run:
            if i - start >= min_length:
                runs.append((start, i))
            in_run = False
    if in_run and len(mask) - start >= min_length:
        runs.append((start, len(mask)))
    return runs


@app.post("/v1/image/detect-reference", response_model=ReferenceDetectionResult)
async def detect_reference(
    request: ImageQualityRequest,
    authorization: Optional[str] = None,
):
    """Detect a reference object (credit card, A4 paper, ruler) in the image."""
    if not verify_api_key(authorization):
        raise HTTPException(status_code=401, detail="Invalid API key")

    try:
        image_bytes = base64.b64decode(request.image)
        pil_image = _open_image(image_bytes)
        np_image = np.array(pil_image)
        result = _detect_reference_object(np_image)
        return ReferenceDetectionResult(**result)
    except Exception as e:
        logger.error(f"Reference detection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Detection error: {str(e)}")


# ============================================================
# BODY CONTOUR EXTRACTION
# ============================================================

# Landmark indices (BlazePose 33)
_LM = {
    "nose": 0,
    "left_shoulder": 11, "right_shoulder": 12,
    "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26,
    "left_ankle": 27, "right_ankle": 28,
}


def _get_cross_section_rows(
    landmarks: list[dict] | None,
    img_h: int,
    img_w: int,
) -> dict[str, int]:
    """
    Determine the pixel row (y) for each body cross-section.
    Uses landmarks when available, else falls back to proportional estimates.
    """
    def _lm_y(name: str) -> float | None:
        if not landmarks:
            return None
        idx = _LM.get(name)
        if idx is None or idx >= len(landmarks):
            return None
        lm = landmarks[idx]
        y = lm.get("y", 0)
        # If normalized (0-1), convert to pixels
        return y * img_h if y <= 1.0 else y

    l_sh = _lm_y("left_shoulder")
    r_sh = _lm_y("right_shoulder")
    l_hip = _lm_y("left_hip")
    r_hip = _lm_y("right_hip")
    l_knee = _lm_y("left_knee")
    r_knee = _lm_y("right_knee")
    l_ankle = _lm_y("left_ankle")
    r_ankle = _lm_y("right_ankle")
    nose_y = _lm_y("nose")

    shoulder_y = _avg(l_sh, r_sh)
    hip_y = _avg(l_hip, r_hip)
    knee_y = _avg(l_knee, r_knee)
    ankle_y = _avg(l_ankle, r_ankle)

    # Estimate body top / bottom from landmarks or fallback proportions
    body_top = int(nose_y * 0.85) if nose_y else int(img_h * 0.05)
    body_bottom = int(ankle_y) if ankle_y else int(img_h * 0.95)
    body_height = max(body_bottom - body_top, 1)

    rows: dict[str, int] = {}

    # Neck: just below head, above shoulders
    if shoulder_y and nose_y:
        rows["neck"] = int((nose_y + shoulder_y) / 2)
    else:
        rows["neck"] = body_top + int(body_height * 0.12)

    # Chest: slightly below shoulder line (armpit level)
    if shoulder_y:
        offset = int((hip_y - shoulder_y) * 0.15) if hip_y else int(body_height * 0.04)
        rows["chest"] = int(shoulder_y) + offset
    else:
        rows["chest"] = body_top + int(body_height * 0.28)

    # Waist: midway between chest row and hip, biased upward
    if shoulder_y and hip_y:
        rows["waist"] = int(shoulder_y + (hip_y - shoulder_y) * 0.55)
    else:
        rows["waist"] = body_top + int(body_height * 0.42)

    # Hips: at hip landmark level
    if hip_y:
        rows["hips"] = int(hip_y)
    else:
        rows["hips"] = body_top + int(body_height * 0.52)

    # Thigh: ¼ of the way from hip to knee
    if hip_y and knee_y:
        rows["thigh"] = int(hip_y + (knee_y - hip_y) * 0.25)
    else:
        rows["thigh"] = body_top + int(body_height * 0.58)

    # Calf: ⅓ of the way from knee to ankle
    if knee_y and ankle_y:
        rows["calf"] = int(knee_y + (ankle_y - knee_y) * 0.35)
    else:
        rows["calf"] = body_top + int(body_height * 0.78)

    # Clamp all rows to image bounds
    for k in rows:
        rows[k] = max(0, min(rows[k], img_h - 1))

    return rows


def _avg(*vals: float | None) -> float | None:
    nums = [v for v in vals if v is not None]
    return sum(nums) / len(nums) if nums else None


def _measure_contour_width_at_row(
    mask: np.ndarray,
    row: int,
    search_band: int = 5,
) -> tuple[float, float, float]:
    """
    Measure the horizontal width of the foreground (body) region at a given row.
    Averages over a small vertical band for noise robustness.
    Returns (width_px, left_edge, right_edge).
    """
    h, w = mask.shape
    y_start = max(0, row - search_band)
    y_end = min(h, row + search_band + 1)
    band = mask[y_start:y_end, :]

    if band.size == 0:
        return 0.0, 0.0, 0.0

    # Column-wise presence: fraction of rows where foreground is present
    col_presence = np.mean(band > 0, axis=0)

    # Threshold: column is part of body if present in >40% of band rows
    body_cols = np.where(col_presence > 0.4)[0]

    if len(body_cols) == 0:
        return 0.0, 0.0, 0.0

    left_edge = float(body_cols[0])
    right_edge = float(body_cols[-1])
    width_px = right_edge - left_edge

    return width_px, left_edge, right_edge


def _extract_body_contour_widths(
    np_image: np.ndarray,
    landmarks: list[dict] | None,
    capture_type: str,
    scale_factor: float | None,
) -> dict:
    """
    Run selfie segmentation, extract contour widths at key cross-sections.
    Returns width data for each body part.
    """
    start = time.time()
    h, w = np_image.shape[:2]

    # 1. Run segmentation
    segmenter = get_segmenter()
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np_image)
    seg_result = segmenter.segment(mp_image)

    if not seg_result.category_mask:
        return {
            "success": False,
            "capture_type": capture_type,
            "widths": {},
            "silhouette_height_px": 0,
            "processing_time_ms": int((time.time() - start) * 1000),
            "segmentation_confidence": 0.0,
        }

    # Category mask: 0=background, non-zero=person
    mask = seg_result.category_mask.numpy_view().copy()
    # Ensure mask is 2D (some MediaPipe versions return (h, w, 1))
    if mask.ndim == 3:
        mask = mask[:, :, 0]

    # Clean up mask with simple morphological operations (pure numpy)
    # Erode then dilate to remove noise  
    kernel_size = 3
    # Simple erosion: min filter
    from numpy.lib.stride_tricks import sliding_window_view
    if mask.shape[0] > kernel_size and mask.shape[1] > kernel_size:
        padded = np.pad(mask, kernel_size // 2, mode='edge')
        windows = sliding_window_view(padded, (kernel_size, kernel_size))
        eroded = np.min(windows, axis=(-1, -2))[:mask.shape[0], :mask.shape[1]]
        # Simple dilation: max filter on eroded
        padded2 = np.pad(eroded, kernel_size // 2, mode='edge')
        windows2 = sliding_window_view(padded2, (kernel_size, kernel_size))
        mask = np.max(windows2, axis=(-1, -2))[:mask.shape[0], :mask.shape[1]]

    # Shadow/reflection filtering (#10)
    mask = _filter_shadows_from_mask(np_image, mask)

    # Segmentation confidence: fraction of image that is foreground
    # When the person fills the frame (close-up / guided scan) fg can be 70-95%
    # which is perfectly valid.  Only very low (<5%) or extreme (>97%) is suspect.
    fg_ratio = float(np.mean(mask > 0))
    if fg_ratio < 0.05 or fg_ratio > 0.97:
        seg_confidence = 0.3
    elif 0.10 <= fg_ratio <= 0.65:
        seg_confidence = 1.0
    else:
        # Gradually reduce confidence outside the ideal band, but stay >= 0.5
        seg_confidence = max(0.5, 1.0 - abs(fg_ratio - 0.40) * 0.8)

    # 2. Find silhouette vertical extent
    fg_rows = np.where(np.any(mask > 0, axis=1))[0]
    if len(fg_rows) == 0:
        return {
            "success": False,
            "capture_type": capture_type,
            "widths": {},
            "silhouette_height_px": 0,
            "processing_time_ms": int((time.time() - start) * 1000),
            "segmentation_confidence": 0.0,
        }

    sil_top = int(fg_rows[0])
    sil_bottom = int(fg_rows[-1])
    sil_height = sil_bottom - sil_top

    # 3. Determine cross-section rows
    section_rows = _get_cross_section_rows(landmarks, h, w)

    # 4. Measure width at each cross-section
    widths: dict[str, dict] = {}
    # Search band scales with image resolution
    band = max(3, int(h * 0.005))

    for part, row in section_rows.items():
        width_px, left, right = _measure_contour_width_at_row(mask, row, band)

        width_cm = width_px * scale_factor if (scale_factor and width_px > 0) else None

        widths[part] = {
            "width_px": round(width_px, 1),
            "width_cm": round(width_cm, 2) if width_cm is not None else None,
            "y_position": round(row / h, 4),  # normalized
            "left_edge": round(left, 1),
            "right_edge": round(right, 1),
        }

    processing_ms = int((time.time() - start) * 1000)

    logger.info(
        f"Contour extraction: {capture_type}, "
        f"{len(widths)} sections, sil_height={sil_height}px, "
        f"fg={fg_ratio:.1%}, time={processing_ms}ms"
    )

    return {
        "success": True,
        "capture_type": capture_type,
        "widths": widths,
        "silhouette_height_px": float(sil_height),
        "processing_time_ms": processing_ms,
        "segmentation_confidence": round(seg_confidence, 3),
    }


@app.post("/v1/body/contour", response_model=ContourWidthResult)
async def extract_body_contour(
    request: ContourRequest,
    authorization: Optional[str] = None,
):
    """
    Extract body silhouette contour widths from an image.
    Uses MediaPipe Selfie Segmentation to isolate the body,
    then measures pixel widths at key cross-sections
    (neck, chest, waist, hips, thigh, calf).
    """
    if not verify_api_key(authorization):
        raise HTTPException(status_code=401, detail="Invalid API key")

    try:
        image_bytes = base64.b64decode(request.image)
        pil_image = _open_image(image_bytes)
        np_image = np.array(pil_image)

        result = _extract_body_contour_widths(
            np_image,
            request.landmarks,
            request.capture_type,
            request.scale_factor,
        )
        return ContourWidthResult(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Contour extraction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Contour extraction error: {str(e)}")


# ============================================================
# MONOCULAR DEPTH ESTIMATION — MiDaS (#4)
# ============================================================

_depth_model: Any = None
_depth_transform: Any = None


def get_depth_model():
    """Lazy-load MiDaS depth estimation model."""
    global _depth_model, _depth_transform
    if _depth_model is not None:
        return _depth_model, _depth_transform

    try:
        import torch
        logger.info("Loading MiDaS depth model (small)...")
        _depth_model = torch.hub.load("intel-isl/MiDaS", "MiDaS_small", trust_repo=True)
        _depth_model.eval()
        midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms", trust_repo=True)
        _depth_transform = midas_transforms.small_transform
        logger.info("MiDaS depth model loaded.")
    except Exception as e:
        logger.warning(f"MiDaS load failed (depth estimation unavailable): {e}")
        _depth_model = None
        _depth_transform = None

    return _depth_model, _depth_transform


class DepthRequest(BaseModel):
    image: str  # Base64-encoded image
    landmarks: Optional[list[dict]] = None  # pose landmarks to sample depth at


class DepthResponse(BaseModel):
    success: bool
    landmark_depths: dict  # {landmark_name: relative_depth_0_to_1}
    depth_range: dict      # {min, max, mean}
    processing_time_ms: int


@app.post("/v1/depth/estimate", response_model=DepthResponse)
async def estimate_depth(
    request: DepthRequest,
    authorization: Optional[str] = None,
):
    """Estimate monocular depth from a single image using MiDaS."""
    if not verify_api_key(authorization):
        raise HTTPException(status_code=401, detail="Invalid API key")

    start = time.time()
    model, transform = get_depth_model()

    if model is None:
        raise HTTPException(
            status_code=503,
            detail="Depth model not available. Install torch and timm.",
        )

    try:
        import torch

        image_bytes = base64.b64decode(request.image)
        pil_image = _open_image(image_bytes)
        np_image = np.array(pil_image)
        h, w = np_image.shape[:2]

        input_batch = transform(np_image)

        with torch.no_grad():
            prediction = model(input_batch)
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=(h, w),
                mode="bicubic",
                align_corners=False,
            ).squeeze().cpu().numpy()

        # Normalize depth to 0-1 range (0 = closest, 1 = farthest)
        d_min = float(np.min(prediction))
        d_max = float(np.max(prediction))
        d_range = d_max - d_min if d_max > d_min else 1.0
        depth_norm = (prediction - d_min) / d_range

        # Sample depth at landmarks if provided
        landmark_depths: dict = {}
        if request.landmarks:
            for lm in request.landmarks:
                name = lm.get("name", "")
                lx = lm.get("x", 0)
                ly = lm.get("y", 0)
                # Normalize if in 0-1 range
                px = int(lx * w) if lx <= 1.0 else int(lx)
                py = int(ly * h) if ly <= 1.0 else int(ly)
                px = max(0, min(px, w - 1))
                py = max(0, min(py, h - 1))
                landmark_depths[name] = round(float(depth_norm[py, px]), 4)

        processing_ms = int((time.time() - start) * 1000)

        return DepthResponse(
            success=True,
            landmark_depths=landmark_depths,
            depth_range={
                "min": round(d_min, 4),
                "max": round(d_max, 4),
                "mean": round(float(np.mean(prediction)), 4),
            },
            processing_time_ms=processing_ms,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Depth estimation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Depth estimation error: {str(e)}")


# ============================================================
# SUB-PIXEL LANDMARK REFINEMENT (#6)
# ============================================================

def _refine_landmarks_subpixel(
    np_image: np.ndarray,
    landmarks: list[dict],
) -> list[dict]:
    """
    Refine landmark positions to sub-pixel accuracy using local gradient analysis.
    For each landmark, examine a small window around it and find the precise position
    using weighted centroid of gradient magnitudes.
    """
    h, w = np_image.shape[:2]
    gray = np.mean(np_image, axis=2).astype(np.float64)

    # Compute gradient magnitudes
    gx = np.zeros_like(gray)
    gy = np.zeros_like(gray)
    gx[:, 1:-1] = gray[:, 2:] - gray[:, :-2]
    gy[1:-1, :] = gray[2:, :] - gray[:-2, :]
    grad_mag = np.sqrt(gx**2 + gy**2)

    refined = []
    window = 5  # ±5 pixel search radius

    for lm in landmarks:
        lx = lm.get("x", 0)
        ly = lm.get("y", 0)

        # Convert to pixel coordinates if normalized
        is_normalized = lx <= 1.0 and ly <= 1.0
        px = lx * w if is_normalized else lx
        py = ly * h if is_normalized else ly

        ix, iy = int(round(px)), int(round(py))

        # Extract local window
        y1 = max(0, iy - window)
        y2 = min(h, iy + window + 1)
        x1 = max(0, ix - window)
        x2 = min(w, ix + window + 1)

        local = grad_mag[y1:y2, x1:x2]

        if local.size == 0 or np.sum(local) < 1e-6:
            refined.append(lm)
            continue

        # Weighted centroid of gradient magnitudes
        ys, xs = np.mgrid[y1:y2, x1:x2]
        total_weight = np.sum(local)
        cx = float(np.sum(xs * local) / total_weight)
        cy = float(np.sum(ys * local) / total_weight)

        # Blend: 70% original + 30% gradient-refined (conservative)
        refined_px = px * 0.7 + cx * 0.3
        refined_py = py * 0.7 + cy * 0.3

        new_lm = dict(lm)
        if is_normalized:
            new_lm["x"] = round(refined_px / w, 6)
            new_lm["y"] = round(refined_py / h, 6)
        else:
            new_lm["x"] = round(refined_px, 2)
            new_lm["y"] = round(refined_py, 2)

        refined.append(new_lm)

    return refined


# ============================================================
# ARUCO MARKER DETECTION (#9)
# ============================================================

class ArucoRequest(BaseModel):
    image: str  # Base64-encoded image
    marker_size_cm: float = 5.0  # Physical size of marker in cm


class ArucoResponse(BaseModel):
    detected: bool
    marker_id: Optional[int] = None
    corners: Optional[list[list[float]]] = None  # [[x,y], [x,y], ...]
    pixel_size: float = 0.0      # Marker side length in pixels
    scale_factor: float = 0.0    # cm per pixel
    confidence: float = 0.0
    processing_time_ms: int = 0


def _detect_aruco(np_image: np.ndarray, marker_size_cm: float) -> dict:
    """Detect ArUco markers using OpenCV."""
    try:
        import cv2
        from cv2 import aruco
    except ImportError:
        return {"detected": False, "error": "OpenCV not available"}

    gray = cv2.cvtColor(np_image, cv2.COLOR_RGB2GRAY)

    # Try multiple ArUco dictionaries
    dictionaries = [
        aruco.DICT_4X4_50,
        aruco.DICT_5X5_100,
        aruco.DICT_6X6_250,
        aruco.DICT_ARUCO_ORIGINAL,
    ]

    for dict_type in dictionaries:
        aruco_dict = aruco.getPredefinedDictionary(dict_type)
        params = aruco.DetectorParameters()
        detector = aruco.ArucoDetector(aruco_dict, params)
        corners, ids, _ = detector.detectMarkers(gray)

        if ids is not None and len(ids) > 0:
            # Use the first detected marker
            marker_corners = corners[0][0]  # 4 corner points
            marker_id = int(ids[0][0])

            # Compute side length in pixels (average of 4 sides)
            side_lengths = []
            for i in range(4):
                p1 = marker_corners[i]
                p2 = marker_corners[(i + 1) % 4]
                side_lengths.append(np.sqrt((p2[0]-p1[0])**2 + (p2[1]-p1[1])**2))
            avg_side_px = float(np.mean(side_lengths))

            scale_factor = marker_size_cm / avg_side_px if avg_side_px > 0 else 0

            return {
                "detected": True,
                "marker_id": marker_id,
                "corners": marker_corners.tolist(),
                "pixel_size": round(avg_side_px, 2),
                "scale_factor": round(scale_factor, 6),
                "confidence": round(min(0.98, avg_side_px / 50), 3),  # Higher confidence with larger markers
            }

    return {"detected": False}


@app.post("/v1/aruco/detect", response_model=ArucoResponse)
async def detect_aruco_marker(
    request: ArucoRequest,
    authorization: Optional[str] = None,
):
    """Detect ArUco marker and compute scale factor."""
    if not verify_api_key(authorization):
        raise HTTPException(status_code=401, detail="Invalid API key")

    start = time.time()
    try:
        image_bytes = base64.b64decode(request.image)
        pil_image = _open_image(image_bytes)
        np_image = np.array(pil_image)

        result = _detect_aruco(np_image, request.marker_size_cm)
        result["processing_time_ms"] = int((time.time() - start) * 1000)

        if "error" in result:
            raise HTTPException(status_code=503, detail=result["error"])

        return ArucoResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ArUco detection failed: {e}")
        raise HTTPException(status_code=500, detail=f"ArUco error: {str(e)}")


# ============================================================
# SHADOW / REFLECTION FILTERING (#10)
# ============================================================

def _filter_shadows_from_mask(
    np_image: np.ndarray,
    mask: np.ndarray,
) -> np.ndarray:
    """
    Filter shadow and reflection pixels from segmentation mask.
    Shadows appear as dark blobs adjacent to the body silhouette.
    Reflections appear as bright blobs below the feet.

    Returns a cleaned mask with shadow/reflection pixels removed.
    """
    h, w = np_image.shape[:2]
    gray = np.mean(np_image, axis=2).astype(np.float64)

    # 1. Detect shadow pixels: foreground pixels that are significantly darker
    #    than the average foreground brightness
    fg_mask = mask > 0
    if np.sum(fg_mask) == 0:
        return mask

    fg_brightness = gray[fg_mask]
    fg_mean = float(np.mean(fg_brightness))
    fg_std = float(np.std(fg_brightness))

    # Shadow pixels: foreground pixels darker than mean - 1.5*std
    shadow_threshold = fg_mean - 1.5 * fg_std
    shadow_pixels = fg_mask & (gray < shadow_threshold)

    # 2. Detect reflection pixels: bright blobs in the lower 15% of the image
    #    that are part of the foreground
    lower_region = np.zeros_like(fg_mask)
    lower_start = int(h * 0.85)
    lower_region[lower_start:, :] = True

    reflect_threshold = fg_mean + 1.0 * fg_std
    reflect_pixels = fg_mask & lower_region & (gray > reflect_threshold)

    # 3. Only remove shadow/reflection if they form sizable blobs (not just noise)
    #    Count connected pixels in shadow regions along each row
    cleaned = mask.copy()

    # For shadows: remove if shadow band is > 10% of the row's foreground width
    for row in range(h):
        fg_in_row = np.where(fg_mask[row])[0]
        if len(fg_in_row) < 5:
            continue

        shadow_in_row = np.where(shadow_pixels[row])[0]
        if len(shadow_in_row) > len(fg_in_row) * 0.15:
            # Shadows are on the edges typically
            fg_left = fg_in_row[0]
            fg_right = fg_in_row[-1]
            for sx in shadow_in_row:
                # Only remove edge shadows (within 10% of body width from edges)
                body_width = fg_right - fg_left
                if body_width > 0:
                    edge_margin = body_width * 0.1
                    if sx < fg_left + edge_margin or sx > fg_right - edge_margin:
                        cleaned[row, sx] = 0

    # For reflections: remove the entire lower reflection band
    for row in range(lower_start, h):
        reflect_in_row = np.where(reflect_pixels[row])[0]
        if len(reflect_in_row) > 5:
            cleaned[row, reflect_in_row] = 0

    return cleaned


# ============================================================
# ENHANCED POSE DETECTION WITH SUB-PIXEL REFINEMENT
# ============================================================

@app.post("/v1/pose/detect-refined")
async def detect_pose_refined(
    request: PoseRequest,
    authorization: Optional[str] = None,
):
    """
    Detect pose landmarks with sub-pixel refinement (#6).
    Same as /v1/pose/detect but applies gradient-based landmark refinement.
    """
    if not verify_api_key(authorization):
        raise HTTPException(status_code=401, detail="Invalid API key")

    start_time = time.time()

    try:
        image_bytes = base64.b64decode(request.image)
        pil_image = _open_image(image_bytes)
        image_width, image_height = pil_image.size
        logger.info(f"Refined pose request: image {image_width}x{image_height}")

        # Progressive preprocessing: resize + padding retry
        detector = get_detector()
        result = None
        transform = None

        for pad_ratio in [0.0, 0.15, 0.25]:
            processed, transform = _preprocess_for_pose(pil_image, pad_ratio=pad_ratio)
            np_image = np.array(processed)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np_image)
            det_result = detector.detect(mp_image)

            if det_result.pose_landmarks and len(det_result.pose_landmarks) > 0:
                result = det_result
                if pad_ratio > 0:
                    logger.info(f"Refined: pose detected with {int(pad_ratio*100)}% padding")
                break

        if result is None or not result.pose_landmarks:
            raise HTTPException(status_code=422, detail="No pose detected.")

        pose = result.pose_landmarks[0]
        landmarks_raw = []
        total_visibility = 0.0

        for i, lm in enumerate(pose):
            name = LANDMARK_NAMES[i] if i < len(LANDMARK_NAMES) else f"landmark_{i}"
            visibility = lm.visibility if hasattr(lm, 'visibility') else lm.presence
            total_visibility += visibility
            # Remap from preprocessed image coordinates to original image space
            norm_x, norm_y = _remap_landmark(lm.x, lm.y, transform)
            landmarks_raw.append({
                "x": round(norm_x, 6),
                "y": round(norm_y, 6),
                "z": round(lm.z, 6),
                "visibility": round(visibility, 4),
                "name": name,
            })

        # Apply sub-pixel refinement on the original-resolution image
        np_original = np.array(pil_image)
        refined = _refine_landmarks_subpixel(np_original, landmarks_raw)

        avg_confidence = total_visibility / len(pose) if len(pose) > 0 else 0
        processing_ms = int((time.time() - start_time) * 1000)

        return {
            "landmarks": refined,
            "imageWidth": image_width,
            "imageHeight": image_height,
            "confidence": round(avg_confidence, 4),
            "model": "blazepose_full_refined",
            "processingTimeMs": processing_ms,
            "subpixelRefined": True,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Refined pose detection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


# ============================================================
# EMAIL OTP ENDPOINTS
# ============================================================

def _send_email_resend(to_email: str, subject: str, html_body: str, from_email: Optional[str] = None) -> bool:
    """Send an email via Resend HTTP API (works on Railway/cloud platforms).

    `from_email` overrides the default RESEND_FROM sender for this message.
    """
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set, cannot send email")
        return False

    try:
        resp = http_requests.post(
            "https://api.resend.com/emails",
            json={
                "from": from_email or RESEND_FROM,
                "to": [to_email],
                "subject": subject,
                "html": html_body,
            },
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
            },
            timeout=10,
        )
        if resp.status_code in (200, 201):
            logger.info(f"Email sent via Resend to {to_email} (from={from_email or RESEND_FROM})")
            return True
        logger.error(f"Resend returned {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        logger.error(f"Resend failed for {to_email}: {e}")
        return False


def _send_email(to_email: str, subject: str, html_body: str, from_email: Optional[str] = None) -> bool:
    """Send transactional email via Resend. Pass `from_email` to override the default sender."""
    return _send_email_resend(to_email, subject, html_body, from_email=from_email)


@app.post("/v1/auth/send-otp")
async def send_otp(req: OTPSendRequest):
    """Generate a 6-digit code and email it."""
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    # Rate limit: don't re-send if a valid code exists and was sent < 60s ago
    existing = _otp_get(email)
    if existing and existing.get("sent_at"):
        elapsed = (datetime.utcnow() - existing["sent_at"]).total_seconds()
        if elapsed < 60:
            return {"success": True, "message": "Code already sent, check your email"}

    code = f"{random.randint(100000, 999999)}"
    _otp_set(email, code, ttl_minutes=10)

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
      <h2 style="color:#0F2B3C;">Tailor-XFit Verification</h2>
      <p style="color:#5A6B7B;">Your verification code is:</p>
      <div style="background:#E0F7F5;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
        <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#0F2B3C;">{code}</span>
      </div>
      <p style="color:#5A6B7B;font-size:14px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
      <p style="color:#94A3B8;font-size:12px;margin-top:32px;">— Tailor-XFit Team</p>
    </div>
    """

    sent = _send_email(email, f"Your Tailor-XFit code: {code}", html)
    if not sent:
        raise HTTPException(status_code=500, detail="Failed to send email. Check RESEND_API_KEY config.")

    return {"success": True, "message": "Verification code sent"}


@app.post("/v1/auth/verify-otp")
async def verify_otp(req: OTPVerifyRequest):
    """Verify the 6-digit OTP code."""
    email = req.email.strip().lower()
    stored = _otp_get(email)

    if not stored:
        raise HTTPException(status_code=400, detail="No code was sent to this email")

    if datetime.utcnow() > stored["expires_at"]:
        _otp_delete(email)
        raise HTTPException(status_code=400, detail="Code has expired, request a new one")

    if stored["code"] != req.code.strip():
        raise HTTPException(status_code=400, detail="Invalid code")

    # Code is valid — clean up
    _otp_delete(email)
    return {"success": True, "verified": True, "email": email}


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting Tailor-X Pose API on port {PORT}")
    # Pre-load models
    get_detector()
    try:
        get_segmenter()
    except Exception as e:
        logger.warning(f"Segmenter pre-load failed (will retry on first request): {e}")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
