# Tailor-X MediaPipe Pose Server

A lightweight Python server that runs **MediaPipe Pose Landmarker** and returns 33 BlazePose body landmarks from uploaded images.

## Quick Start (Local)

```bash
cd server
pip install -r requirements.txt
python server.py
```

Server starts at `http://localhost:8000`. Test it:

```bash
curl http://localhost:8000/health
```

The model file (`pose_landmarker_full.task`, ~13MB) is **auto-downloaded** on first run.

## Configure the App

Create a `.env` file in the `xfit/` root:

```env
EXPO_PUBLIC_POSE_API_URL=http://<YOUR_IP>:8000/v1/pose
EXPO_PUBLIC_POSE_API_KEY=your-secret-key
```

For local development with a physical device, use your LAN IP (e.g. `http://192.168.1.100:8000/v1/pose`).

## Deploy to Production

### Docker

```bash
cd server
docker build -t tailorx-pose .
docker run -p 8080:8080 -e TAILORX_API_KEY=your-secret tailorx-pose
```

### Google Cloud Run (recommended)

```bash
gcloud run deploy tailorx-pose \
  --source=./server \
  --region=us-central1 \
  --memory=1Gi \
  --cpu=1 \
  --set-env-vars=TAILORX_API_KEY=your-secret \
  --allow-unauthenticated
```

Then set `EXPO_PUBLIC_POSE_API_URL=https://tailorx-pose-xxxxx.run.app/v1/pose`

## API

### `GET /health`
Returns `{ status: "ok", model_loaded: true, version: "1.0.0" }`

### `POST /v1/pose/detect`
**Body:**
```json
{
  "image": "<base64-encoded-image>",
  "captureType": "front",
  "returnFormat": "normalized"
}
```

**Response:**
```json
{
  "landmarks": [
    { "x": 0.512, "y": 0.098, "z": -0.023, "visibility": 0.99, "name": "nose" },
    ...
  ],
  "imageWidth": 1080,
  "imageHeight": 1920,
  "confidence": 0.92,
  "model": "blazepose_full",
  "processingTimeMs": 145
}
```

## Processing Pipeline

The app tries processors in this order:

| Priority | Processor | Accuracy | Requirement |
|---|---|---|---|
| 1 | Cloud MediaPipe server | **±1-2cm** | This server running + API key set |
| 2 | On-device MediaPipe | **±2-3cm** | `@gymbrosinc/react-native-mediapipe-pose` (installed) |
| 3 | Anthropometric fallback | **±4-5cm** | None (always available) |
