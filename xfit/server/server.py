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
    GET  /health        - Health check
    POST /v1/pose/detect - Detect pose landmarks from base64 image
"""
from __future__ import annotations

import base64
import io
import time
import os
import logging
from typing import Optional, Any

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

# ============================================================
# MODELS
# ============================================================

class PoseRequest(BaseModel):
    image: str                # Base64-encoded image
    captureType: str = "front"  # front | side | back
    model: str = "blazepose_full"
    returnFormat: str = "normalized"  # normalized (0-1) or pixel

class LandmarkResponse(BaseModel):
    x: float
    y: float
    z: float
    visibility: float
    name: str

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
    version="1.0.0",
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
        version="1.0.0",
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
# RUN
# ============================================================

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting Tailor-X Pose API on port {PORT}")
    # Pre-load model
    get_detector()
    uvicorn.run(app, host="0.0.0.0", port=PORT)
