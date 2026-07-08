/**
 * Contour Service — Silhouette-based Body Width Measurement
 * 
 * Calls the server's /v1/body/contour endpoint which runs MediaPipe
 * Selfie Segmentation to extract the body silhouette, then measures
 * pixel widths at key cross-sections (neck, chest, waist, hips, thigh, calf).
 * 
 * These contour widths replace or blend with the skeleton-only heuristics
 * used by the measurement engine to improve circumference confidence.
 * Exact error ranges must come from a tape-measure validation study.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Landmark } from './measurementEngine';

// ============================================================
// TYPES
// ============================================================

export interface ContourWidth {
  width_px: number;
  width_cm: number | null;
  y_position: number;   // normalized 0-1
  left_edge: number;
  right_edge: number;
  confidence?: number;
}

export interface ContourResult {
  success: boolean;
  captureType: 'front' | 'side';
  widths: Record<string, ContourWidth>;
  silhouetteHeightPx: number;
  processingTimeMs: number;
  segmentationConfidence: number;
  partConfidence?: Record<string, number>;
}

// ============================================================
// CONFIG
// ============================================================

const API_BASE_URL =
  process.env.EXPO_PUBLIC_POSE_API_URL?.replace('/v1/pose', '') ||
  'https://tailorx-pose-api-production.up.railway.app';
const API_KEY = process.env.EXPO_PUBLIC_POSE_API_KEY || '';
const TIMEOUT_MS = 30000;

// ============================================================
// SERVICE
// ============================================================

class ContourService {
  private isAvailable: boolean | null = null;

  /**
   * Extract body contour widths from an image via server-side segmentation.
   * 
   * @param imageUri  Local file URI of the captured photo
   * @param captureType  'front' or 'side'
   * @param landmarks  Pose landmarks (used for precise cross-section positioning)
   * @param scaleFactor  cm per pixel (from calibration)
   */
  async extractContour(
    imageUri: string,
    captureType: 'front' | 'side',
    landmarks: Landmark[] | null,
    scaleFactor: number | null,
  ): Promise<ContourResult | null> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      // Read image as base64
      const base64Image = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64',
      });

      // Build landmark data for the server
      const landmarkData = landmarks
        ? landmarks.map(lm => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility,
          }))
        : null;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (API_KEY) {
        headers['Authorization'] = `Bearer ${API_KEY}`;
      }

      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(`${API_BASE_URL}/v1/body/contour`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          image: base64Image,
          capture_type: captureType,
          landmarks: landmarkData,
          scale_factor: scaleFactor,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      timeoutId = null;

      if (!response.ok) {
        console.warn(`Contour API returned ${response.status}`);
        this.isAvailable = false;
        return null;
      }

      const data = await response.json();
      this.isAvailable = true;

      if (!data.success) {
        console.warn('Contour extraction failed on server');
        return null;
      }

      return {
        success: data.success,
        captureType: data.capture_type,
        widths: data.widths,
        silhouetteHeightPx: data.silhouette_height_px,
        processingTimeMs: data.processing_time_ms,
        segmentationConfidence: data.segmentation_confidence,
        partConfidence: this.buildPartConfidence(data.widths, data.segmentation_confidence),
      };
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error?.name === 'AbortError') {
        console.warn('Contour extraction timed out');
      } else {
        console.warn('Contour service unavailable:', error?.message);
      }
      this.isAvailable = false;
      return null;
    }
  }

  /**
   * Check if the contour service is reachable.
   */
  async checkAvailability(): Promise<boolean> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_BASE_URL}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      timeoutId = null;
      this.isAvailable = res.ok;
      return this.isAvailable;
    } catch {
      if (timeoutId) clearTimeout(timeoutId);
      this.isAvailable = false;
      return false;
    }
  }

  private buildPartConfidence(
    widths: Record<string, ContourWidth> | undefined,
    segmentationConfidence: number
  ): Record<string, number> {
    const result: Record<string, number> = {};
    const base = this.normalizeConfidence(segmentationConfidence);
    for (const [part, width] of Object.entries(widths || {})) {
      const explicitRaw = (width as any).confidence;
      const explicit = typeof explicitRaw === 'number'
        ? this.normalizeConfidence(explicitRaw)
        : null;
      const hasEdges = Number.isFinite(width.left_edge) && Number.isFinite(width.right_edge);
      const hasWidth = Number.isFinite(width.width_px) && width.width_px > 0;
      const geometryPenalty = hasEdges && hasWidth ? 1 : 0.6;
      result[part] = Math.max(0, Math.min(1, (explicit ?? base) * geometryPenalty));
    }
    return result;
  }

  private normalizeConfidence(value: unknown): number {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) return 0;
    return value > 1 ? Math.min(1, value / 100) : Math.min(1, value);
  }

  get available(): boolean | null {
    return this.isAvailable;
  }
}

export const contourService = new ContourService();
