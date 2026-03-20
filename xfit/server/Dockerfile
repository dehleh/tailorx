FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for MediaPipe (OpenGL ES + OpenGL + glib)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libgles2-mesa \
    libegl1-mesa \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

# Download models at build time
RUN python -c "import urllib.request; \
    urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task', 'pose_landmarker_full.task'); \
    urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', 'selfie_segmenter.tflite')"

EXPOSE 8080

# Railway sets PORT env var automatically. Uvicorn reads it via shell expansion.
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
