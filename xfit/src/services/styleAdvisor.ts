import { BodyMeasurement } from '../types/measurements';
import { UserProfile } from '../types/user';

export interface StyleAdvice {
  bodyType: string;
  bodyTypeReason: string;
  fitTips: string[];
  styleIdeas: string[];
  colorPalette: string[];
  wardrobeHabits: string[];
  shoppingRules: string[];
}

const styleTone: Record<string, string[]> = {
  classic: ['structured shirts', 'clean trousers', 'timeless jackets'],
  modern: ['sharp separates', 'clean sneakers or loafers', 'minimal layering'],
  business: ['tailored jackets', 'pressed shirts', 'polished shoes'],
  traditional: ['well-cut native wear', 'balanced embroidery', 'clean sleeve and trouser breaks'],
  modest: ['longer layers', 'soft structure', 'clean necklines'],
  streetwear: ['relaxed overshirts', 'clean tees', 'proportional trousers'],
  minimal: ['simple silhouettes', 'low-contrast outfits', 'high-quality basics'],
};

const colorPalettes: Record<string, string[]> = {
  neutral: ['navy', 'white', 'charcoal', 'stone', 'black'],
  warm: ['olive', 'cream', 'camel', 'rust', 'deep brown'],
  cool: ['navy', 'slate', 'ice blue', 'white', 'graphite'],
  bold: ['teal', 'cobalt', 'white', 'black', 'mustard accents'],
  earth: ['olive', 'sand', 'brown', 'cream', 'forest green'],
};

function ratio(a?: number, b?: number): number | null {
  if (!a || !b) return null;
  return a / b;
}

function inferBodyType(user?: UserProfile | null, latest?: BodyMeasurement | null) {
  const m = latest?.measurements;
  const shoulderHip = ratio(m?.shoulders, m?.hips);
  const waistHip = ratio(m?.waist, m?.hips);
  const chestHip = ratio(m?.chest || m?.bust, m?.hips);

  if (!m || !shoulderHip || !waistHip || !chestHip) {
    return {
      bodyType: 'Profile pending',
      reason: 'Complete a scan to unlock body-type analysis from your proportions.',
    };
  }

  if (user?.gender === 'female') {
    if (waistHip < 0.75 && Math.abs(chestHip - 1) < 0.12) {
      return { bodyType: 'Balanced hourglass', reason: 'Bust/hip balance with a defined waist.' };
    }
    if (chestHip < 0.9) return { bodyType: 'Pear leaning', reason: 'Hip/seat measurement is stronger than upper-body width.' };
    if (chestHip > 1.08) return { bodyType: 'Inverted triangle', reason: 'Upper-body measurement is stronger than hip/seat.' };
    return { bodyType: 'Soft rectangle', reason: 'Upper body, waist, and hip differences are moderate.' };
  }

  if (shoulderHip > 0.48 && chestHip > 1.05 && waistHip < 0.92) {
    return { bodyType: 'V-taper', reason: 'Shoulders/chest are stronger than waist and hip.' };
  }
  if (waistHip > 0.98) return { bodyType: 'Oval', reason: 'Waist and hip are close, so vertical balance matters.' };
  if (Math.abs(chestHip - 1) < 0.08) return { bodyType: 'Rectangle', reason: 'Upper body and hip are closely balanced.' };
  return { bodyType: 'Balanced', reason: 'Your major proportions are close with no single dominant line.' };
}

export function buildStyleAdvice(
  user?: UserProfile | null,
  latest?: BodyMeasurement | null,
): StyleAdvice {
  const inferred = inferBodyType(user, latest);
  const preferredStyle = user?.preferredStyle || 'modern';
  const colorPreference = user?.colorPreference || 'neutral';
  const stylePieces = styleTone[preferredStyle] || styleTone.modern;

  const fitTips = [
    'Keep shoulder seams clean and sleeve length precise.',
    latest ? 'Use your latest scan as a starting point, then let a tailor review low-confidence parts.' : 'Complete your first scan before buying fitted garments online.',
    user?.heightCm ? 'Use your known height as calibration for future scans.' : 'Add height before scanning for better scale calibration.',
  ];

  if (inferred.bodyType.includes('V-taper') || inferred.bodyType.includes('Inverted')) {
    fitTips.push('Avoid over-building the shoulders; balance the lower body with clean trouser volume.');
  } else if (inferred.bodyType.includes('Pear')) {
    fitTips.push('Use stronger upper-body structure and clean hip-skimming lower garments.');
  } else if (inferred.bodyType.includes('Oval')) {
    fitTips.push('Prioritize vertical lines, medium-weight fabric, and relaxed waist ease.');
  } else {
    fitTips.push('Choose garments that follow the body without clinging at the waist or hip.');
  }

  return {
    bodyType: inferred.bodyType,
    bodyTypeReason: inferred.reason,
    fitTips,
    styleIdeas: [
      `Build around ${stylePieces[0]}, ${stylePieces[1]}, and ${stylePieces[2]}.`,
      'Repeat your best-fitting garment dimensions when ordering custom pieces.',
      'Keep one statement element per outfit: color, texture, print, or cut.',
    ],
    colorPalette: colorPalettes[colorPreference] || colorPalettes.neutral,
    wardrobeHabits: [
      'Separate alteration-ready pieces from pieces that already fit well.',
      'Rotate high-use outfits and repair loose hems/buttons early.',
      'Keep core basics in reliable colors before buying statement pieces.',
    ],
    shoppingRules: [
      'Check shoulder, chest/bust, waist, hip, and sleeve measurements before buying.',
      'Buy fabrics that match the garment purpose: breathable for daily wear, structured for formal wear.',
      'Avoid buying only by size label; size systems vary by brand and country.',
    ],
  };
}
