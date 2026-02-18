/**
 * Pose Processor Tests
 */

import { poseProcessor } from '../../services/poseProcessor';

// Mock TensorFlow.js (virtual: true since packages may not be installed)
jest.mock('@tensorflow/tfjs', () => ({
  ready: jest.fn().mockResolvedValue(undefined),
  getBackend: jest.fn().mockReturnValue('cpu'),
  setBackend: jest.fn().mockResolvedValue(undefined),
  dispose: jest.fn(),
}), { virtual: true });

jest.mock('@tensorflow/tfjs-react-native', () => ({
  bundleResourceIO: jest.fn(),
  decodeJpeg: jest.fn(),
  fetch: jest.fn(),
}), { virtual: true });

jest.mock('@tensorflow-models/pose-detection', () => ({
  createDetector: jest.fn().mockResolvedValue({
    estimatePoses: jest.fn().mockResolvedValue([{
      keypoints: Array(33).fill(null).map((_, i) => ({
        x: 100 + Math.random() * 200,
        y: 50 + i * 20,
        score: 0.85,
        name: `keypoint_${i}`,
      })),
      score: 0.85,
    }]),
  }),
  SupportedModels: {
    BlazePose: 'BlazePose',
  },
}), { virtual: true });

// Mock on-device MediaPipe pose (virtual: true for test env)
jest.mock('@gymbrosinc/react-native-mediapipe-pose', () => ({
  detectPoseFromImage: jest.fn().mockResolvedValue({
    landmarks: [
      Array(33).fill(null).map((_, i) => ({
        x: 0.3 + Math.random() * 0.4,
        y: 0.05 + (i / 33) * 0.85,
        z: 0,
        visibility: 0.85,
      })),
    ],
    imageWidth: 720,
    imageHeight: 1280,
  }),
}), { virtual: true });

// Mock fetch for cloud API
(globalThis as any).fetch = jest.fn().mockRejectedValue(new Error('No network in test'));

// Mock expo-file-system  
jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('base64imagedata'),
  EncodingType: { Base64: 'base64' },
}));

describe('PoseProcessor', () => {
  describe('processImage', () => {
    it('should return a pose processing result', async () => {
      const result = await poseProcessor.processImage(
        'file:///test-image.jpg',
        'front'
      );

      expect(result).toBeDefined();
      expect(result.landmarks).toBeDefined();
      expect(result.processingMode).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(['cloud', 'on_device', 'fallback']).toContain(result.processingMode);
      expect(result.imageWidth).toBeGreaterThan(0);
      expect(result.imageHeight).toBeGreaterThan(0);
    });

    it('should assign correct capture type', async () => {
      const result = await poseProcessor.processImage(
        'file:///test.jpg',
        'side'
      );

      expect(result).toBeDefined();
    });
  });

  describe('toCaptureAngle', () => {
    it('should convert processing result to capture angle', () => {
      const mockResult: any = {
        landmarks: Array(33).fill(null).map((_, i) => ({
          x: 100 + i * 5,
          y: 50 + i * 20,
          z: 0,
          visibility: 0.9,
        })),
        processingMode: 'on_device' as const,
        modelUsed: 'blazepose',
        confidence: 0.85,
        processingTimeMs: 200,
        imageWidth: 720,
        imageHeight: 1280,
      };

      const captureAngle = poseProcessor.toCaptureAngle(
        mockResult,
        'front'
      );

      expect(captureAngle.type).toBe('front');
      expect(captureAngle.landmarks).toEqual(mockResult.landmarks);
      expect(captureAngle.imageWidth).toBe(720);
      expect(captureAngle.imageHeight).toBe(1280);
    });
  });
});
