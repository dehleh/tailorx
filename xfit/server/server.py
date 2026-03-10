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
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Any
from datetime import datetime, timedelta

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
from PIL import Image

# ============================================================
# CONFIG
# ============================================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tailorx-pose")

API_KEY = os.environ.get("TAILORX_API_KEY", "")
PORT = int(os.environ.get("PORT", 8000))
MODEL_PATH = os.environ.get("MODEL_PATH", "pose_landmarker_full.task")
SEGMENTATION_MODEL_PATH = os.environ.get("SEGMENTATION_MODEL_PATH", "selfie_segmenter.tflite")

# SMTP config for email OTP
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER = os.environ.get("SMTP_USER", "")       # e.g. your-email@gmail.com
SMTP_PASS = os.environ.get("SMTP_PASS", "")       # Gmail App Password (not your login password)
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)

# In-memory OTP store: { email: { code, expires_at } }
_otp_store: dict[str, dict] = {}

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        _detector = vision.PoseLandmarker.create_from_options(options)
        logger.info("MediaPipe Pose Landmarker loaded successfully.")
    
    return _detector

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

# ============================================================
# ENDPOINTS
# ============================================================

@app.get("/health", response_model=HealthResponse)
@app.get("/v1/pose/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        model_loaded=_detector is not None,
        version="2.0.0",
    )

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
        # Decode base64 image
        image_bytes = base64.b64decode(request.image)
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_width, image_height = pil_image.size

        # Run server-side image quality check (non-blocking)
        quality = _analyze_image_quality(np.array(pil_image))
        if not quality["is_acceptable"]:
            logger.warning(f"Image quality issues: {quality['issues']}")

        # Convert to MediaPipe Image
        np_image = np.array(pil_image)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np_image)

        # Run pose detection
        detector = get_detector()
        result = detector.detect(mp_image)

        if not result.pose_landmarks or len(result.pose_landmarks) == 0:
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
            
            if request.returnFormat == "normalized":
                x, y = lm.x, lm.y
            else:
                x, y = lm.x * image_width, lm.y * image_height
            
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
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
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
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
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

    # Segmentation confidence: fraction of image that is foreground (expect 15-60%)
    fg_ratio = float(np.mean(mask > 0))
    seg_confidence = 1.0 if 0.10 <= fg_ratio <= 0.65 else max(0.3, 1.0 - abs(fg_ratio - 0.35) * 2)

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
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
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
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
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
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
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
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        np_image = np.array(pil_image)
        image_width, image_height = pil_image.size

        # Standard pose detection
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np_image)
        detector = get_detector()
        result = detector.detect(mp_image)

        if not result.pose_landmarks or len(result.pose_landmarks) == 0:
            raise HTTPException(status_code=422, detail="No pose detected.")

        pose = result.pose_landmarks[0]
        landmarks_raw = []
        total_visibility = 0.0

        for i, lm in enumerate(pose):
            name = LANDMARK_NAMES[i] if i < len(LANDMARK_NAMES) else f"landmark_{i}"
            visibility = lm.visibility if hasattr(lm, 'visibility') else lm.presence
            total_visibility += visibility
            landmarks_raw.append({
                "x": round(lm.x, 6),
                "y": round(lm.y, 6),
                "z": round(lm.z, 6),
                "visibility": round(visibility, 4),
                "name": name,
            })

        # Apply sub-pixel refinement
        refined = _refine_landmarks_subpixel(np_image, landmarks_raw)

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

def _send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send an email via SMTP."""
    if not SMTP_USER or not SMTP_PASS:
        logger.error("SMTP_USER and SMTP_PASS must be set to send emails")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to_email, msg.as_string())
        logger.info(f"OTP email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


@app.post("/v1/auth/send-otp")
async def send_otp(req: OTPSendRequest):
    """Generate a 6-digit code and email it."""
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    # Rate limit: don't re-send if a valid code exists and was sent < 60s ago
    existing = _otp_store.get(email)
    if existing and existing.get("sent_at"):
        elapsed = (datetime.utcnow() - existing["sent_at"]).total_seconds()
        if elapsed < 60:
            return {"success": True, "message": "Code already sent, check your email"}

    code = f"{random.randint(100000, 999999)}"
    _otp_store[email] = {
        "code": code,
        "expires_at": datetime.utcnow() + timedelta(minutes=10),
        "sent_at": datetime.utcnow(),
    }

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
        raise HTTPException(status_code=500, detail="Failed to send email. Check server SMTP config.")

    return {"success": True, "message": "Verification code sent"}


@app.post("/v1/auth/verify-otp")
async def verify_otp(req: OTPVerifyRequest):
    """Verify the 6-digit OTP code."""
    email = req.email.strip().lower()
    stored = _otp_store.get(email)

    if not stored:
        raise HTTPException(status_code=400, detail="No code was sent to this email")

    if datetime.utcnow() > stored["expires_at"]:
        del _otp_store[email]
        raise HTTPException(status_code=400, detail="Code has expired, request a new one")

    if stored["code"] != req.code.strip():
        raise HTTPException(status_code=400, detail="Invalid code")

    # Code is valid — clean up
    del _otp_store[email]
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
