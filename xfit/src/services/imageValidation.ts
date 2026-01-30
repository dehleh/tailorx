/**
 * Image Validation Service
 * Validates image quality before ML processing
 */

export interface ValidationResult {
  isValid: boolean;
  score: number; // 0-100
  issues: ValidationIssue[];
  recommendations: string[];
}

export interface ValidationIssue {
  type: 'lighting' | 'blur' | 'distance' | 'pose' | 'occlusion';
  severity: 'low' | 'medium' | 'high';
  message: string;
}

class ImageValidationService {
  /**
   * Validate image for body measurement
   */
  async validateForMeasurement(imageUri: string): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // 1. Check lighting
    const lightingCheck = await this.checkLighting(imageUri);
    if (!lightingCheck.isGood) {
      issues.push({
        type: 'lighting',
        severity: lightingCheck.severity,
        message: lightingCheck.message,
      });
      score -= lightingCheck.penalty;
      recommendations.push(lightingCheck.recommendation);
    }

    // 2. Check blur/sharpness
    const blurCheck = await this.checkBlur(imageUri);
    if (blurCheck.isBlurry) {
      issues.push({
        type: 'blur',
        severity: 'high',
        message: 'Image appears blurry',
      });
      score -= 30;
      recommendations.push('Hold camera steady or use timer');
    }

    // 3. Check distance to subject
    const distanceCheck = await this.checkDistance(imageUri);
    if (!distanceCheck.isOptimal) {
      issues.push({
        type: 'distance',
        severity: 'medium',
        message: distanceCheck.message,
      });
      score -= 15;
      recommendations.push(distanceCheck.recommendation);
    }

    // 4. Check pose/body position
    const poseCheck = await this.checkPose(imageUri);
    if (!poseCheck.isCorrect) {
      issues.push({
        type: 'pose',
        severity: 'high',
        message: poseCheck.message,
      });
      score -= 25;
      recommendations.push('Stand straight with arms slightly away from body');
    }

    // 5. Check for occlusions
    const occlusionCheck = await this.checkOcclusions(imageUri);
    if (occlusionCheck.hasOcclusions) {
      issues.push({
        type: 'occlusion',
        severity: 'high',
        message: 'Parts of body are obscured',
      });
      score -= 20;
      recommendations.push('Ensure full body is visible and unobstructed');
    }

    return {
      isValid: score >= 60,
      score: Math.max(0, score),
      issues,
      recommendations,
    };
  }

  /**
   * Check lighting conditions
   */
  private async checkLighting(imageUri: string): Promise<{
    isGood: boolean;
    severity: 'low' | 'medium' | 'high';
    message: string;
    penalty: number;
    recommendation: string;
  }> {
    // TODO: Implement actual brightness analysis
    // For now, return mock data
    const brightness = Math.random();

    if (brightness < 0.3) {
      return {
        isGood: false,
        severity: 'high',
        message: 'Image is too dark',
        penalty: 25,
        recommendation: 'Move to better lit area or turn on lights',
      };
    } else if (brightness > 0.8) {
      return {
        isGood: false,
        severity: 'medium',
        message: 'Image is overexposed',
        penalty: 15,
        recommendation: 'Reduce direct sunlight or bright lights',
      };
    }

    return {
      isGood: true,
      severity: 'low',
      message: 'Lighting is good',
      penalty: 0,
      recommendation: '',
    };
  }

  /**
   * Check image blur
   */
  private async checkBlur(imageUri: string): Promise<{
    isBlurry: boolean;
    sharpness: number;
  }> {
    // TODO: Implement Laplacian variance for blur detection
    const sharpness = Math.random();
    return {
      isBlurry: sharpness < 0.4,
      sharpness,
    };
  }

  /**
   * Check distance to subject
   */
  private async checkDistance(imageUri: string): Promise<{
    isOptimal: boolean;
    message: string;
    recommendation: string;
  }> {
    // TODO: Implement body size detection in frame
    const bodyPercentage = Math.random() * 0.5 + 0.3; // 30-80%

    if (bodyPercentage < 0.4) {
      return {
        isOptimal: false,
        message: 'Subject is too far from camera',
        recommendation: 'Move closer (2-3 meters recommended)',
      };
    } else if (bodyPercentage > 0.75) {
      return {
        isOptimal: false,
        message: 'Subject is too close to camera',
        recommendation: 'Step back (2-3 meters recommended)',
      };
    }

    return {
      isOptimal: true,
      message: 'Distance is optimal',
      recommendation: '',
    };
  }

  /**
   * Check pose correctness
   */
  private async checkPose(imageUri: string): Promise<{
    isCorrect: boolean;
    message: string;
  }> {
    // TODO: Use ML model to detect pose
    // Check: arms away from body, standing straight, facing camera
    const isCorrect = Math.random() > 0.2;

    if (!isCorrect) {
      return {
        isCorrect: false,
        message: 'Incorrect pose detected',
      };
    }

    return {
      isCorrect: true,
      message: 'Pose is correct',
    };
  }

  /**
   * Check for occlusions
   */
  private async checkOcclusions(imageUri: string): Promise<{
    hasOcclusions: boolean;
  }> {
    // TODO: Detect if body parts are hidden
    return {
      hasOcclusions: Math.random() < 0.1,
    };
  }

  /**
   * Get optimal capture conditions
   */
  getOptimalConditions(): {
    lighting: string;
    distance: string;
    pose: string;
    clothing: string;
    background: string;
  } {
    return {
      lighting: 'Natural light or well-lit room (avoid direct sunlight)',
      distance: '2-3 meters from camera',
      pose: 'Stand straight, arms slightly away from body, facing camera',
      clothing: 'Form-fitting clothes or minimal clothing',
      background: 'Plain, uncluttered background',
    };
  }
}

export const imageValidationService = new ImageValidationService();
