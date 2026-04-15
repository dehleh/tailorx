/**
 * Size-chart lookup service based on ISO 8559-1:2017 reference data.
 * Maps body measurements → standard garment sizes (XS–XXL).
 */

export type ClothingSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

interface SizeRange {
  min: number;
  max: number;
}

interface SizeChart {
  chest: Record<ClothingSize, SizeRange>;
  waist: Record<ClothingSize, SizeRange>;
  hips: Record<ClothingSize, SizeRange>;
  shoulders?: Record<ClothingSize, SizeRange>;
  neck?: Record<ClothingSize, SizeRange>;
}

// ISO 8559-1 Male body measurement size chart (cm)
const MALE_SIZE_CHART: SizeChart = {
  chest: {
    XS: { min: 88, max: 91 },
    S:  { min: 92, max: 95 },
    M:  { min: 96, max: 99 },
    L:  { min: 100, max: 103 },
    XL: { min: 104, max: 111 },
    XXL:{ min: 112, max: 120 },
  },
  waist: {
    XS: { min: 72, max: 75 },
    S:  { min: 76, max: 79 },
    M:  { min: 80, max: 83 },
    L:  { min: 84, max: 91 },
    XL: { min: 92, max: 99 },
    XXL:{ min: 100, max: 108 },
  },
  hips: {
    XS: { min: 88, max: 91 },
    S:  { min: 92, max: 95 },
    M:  { min: 96, max: 99 },
    L:  { min: 100, max: 103 },
    XL: { min: 104, max: 111 },
    XXL:{ min: 112, max: 116 },
  },
  shoulders: {
    XS: { min: 41, max: 42 },
    S:  { min: 43, max: 44 },
    M:  { min: 45, max: 46 },
    L:  { min: 47, max: 48 },
    XL: { min: 49, max: 50 },
    XXL:{ min: 51, max: 53 },
  },
  neck: {
    XS: { min: 36, max: 37 },
    S:  { min: 37, max: 38 },
    M:  { min: 38, max: 39 },
    L:  { min: 39, max: 41 },
    XL: { min: 41, max: 43 },
    XXL:{ min: 43, max: 45 },
  },
};

// ISO 8559-1 Female body measurement size chart (cm)
const FEMALE_SIZE_CHART: SizeChart = {
  chest: {
    XS: { min: 80, max: 83 },
    S:  { min: 84, max: 87 },
    M:  { min: 88, max: 91 },
    L:  { min: 92, max: 99 },
    XL: { min: 100, max: 107 },
    XXL:{ min: 108, max: 116 },
  },
  waist: {
    XS: { min: 60, max: 63 },
    S:  { min: 64, max: 67 },
    M:  { min: 68, max: 71 },
    L:  { min: 72, max: 79 },
    XL: { min: 80, max: 91 },
    XXL:{ min: 92, max: 98 },
  },
  hips: {
    XS: { min: 86, max: 89 },
    S:  { min: 90, max: 93 },
    M:  { min: 94, max: 97 },
    L:  { min: 98, max: 105 },
    XL: { min: 106, max: 113 },
    XXL:{ min: 114, max: 122 },
  },
  shoulders: {
    XS: { min: 34, max: 35 },
    S:  { min: 36, max: 37 },
    M:  { min: 38, max: 39 },
    L:  { min: 40, max: 41 },
    XL: { min: 42, max: 43 },
    XXL:{ min: 44, max: 46 },
  },
  neck: {
    XS: { min: 33, max: 33.5 },
    S:  { min: 34, max: 34.5 },
    M:  { min: 35, max: 35.5 },
    L:  { min: 36, max: 37 },
    XL: { min: 37, max: 38 },
    XXL:{ min: 38, max: 40 },
  },
};

export interface SizeLookupResult {
  /** Best-fit overall size */
  recommendedSize: ClothingSize;
  /** Per-measurement size breakdown */
  perMeasurement: Record<string, ClothingSize | 'below XS' | 'above XXL'>;
  /** Fit notes (e.g., "Chest is L but waist is M — consider L for comfort") */
  notes: string[];
}

function findSizeForValue(
  value: number,
  sizeRanges: Record<ClothingSize, SizeRange>
): ClothingSize | 'below XS' | 'above XXL' {
  const sizes: ClothingSize[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

  for (const size of sizes) {
    const range = sizeRanges[size];
    if (value >= range.min && value <= range.max) {
      return size;
    }
  }

  // Check if it's between sizes (falls in a gap) — pick closest
  for (let i = 0; i < sizes.length - 1; i++) {
    const current = sizeRanges[sizes[i]];
    const next = sizeRanges[sizes[i + 1]];
    if (value > current.max && value < next.min) {
      // In the gap — pick the closer one
      const distToCurrent = value - current.max;
      const distToNext = next.min - value;
      return distToCurrent <= distToNext ? sizes[i] : sizes[i + 1];
    }
  }

  if (value < sizeRanges.XS.min) return 'below XS';
  if (value > sizeRanges.XXL.max) return 'above XXL';

  return 'M'; // fallback
}

const SIZE_ORDER: Record<string, number> = {
  'below XS': -1,
  'XS': 0,
  'S': 1,
  'M': 2,
  'L': 3,
  'XL': 4,
  'XXL': 5,
  'above XXL': 6,
};

/**
 * Look up clothing sizes from body measurements.
 */
export function lookupSize(
  measurements: Record<string, number>,
  gender: 'male' | 'female' | 'other'
): SizeLookupResult {
  const chart = gender === 'female' ? FEMALE_SIZE_CHART : MALE_SIZE_CHART;
  const perMeasurement: Record<string, ClothingSize | 'below XS' | 'above XXL'> = {};
  const sizeVotes: Record<string, number> = {};
  const notes: string[] = [];

  // Primary fitting measurements and their weights
  const fitKeys: Array<{ key: string; weight: number }> = [
    { key: 'chest', weight: 3 },
    { key: 'waist', weight: 2 },
    { key: 'hips', weight: 2 },
    { key: 'shoulders', weight: 1 },
    { key: 'neck', weight: 1 },
  ];

  for (const { key, weight } of fitKeys) {
    const value = measurements[key];
    const sizeRanges = chart[key as keyof SizeChart];
    if (!value || value <= 0 || !sizeRanges) continue;

    const size = findSizeForValue(value, sizeRanges);
    perMeasurement[key] = size;

    if (size !== 'below XS' && size !== 'above XXL') {
      sizeVotes[size] = (sizeVotes[size] || 0) + weight;
    }
  }

  // Determine recommended size by weighted vote
  let recommendedSize: ClothingSize = 'M';
  let maxVotes = 0;
  for (const [size, votes] of Object.entries(sizeVotes)) {
    if (votes > maxVotes) {
      maxVotes = votes;
      recommendedSize = size as ClothingSize;
    }
  }

  // Generate fit notes
  const uniqueSizes = [...new Set(Object.values(perMeasurement))];
  const standardSizes = uniqueSizes.filter(s => s !== 'below XS' && s !== 'above XXL') as ClothingSize[];

  if (standardSizes.length > 1) {
    const sorted = standardSizes.sort((a, b) => SIZE_ORDER[a] - SIZE_ORDER[b]);
    if (SIZE_ORDER[sorted[sorted.length - 1]] - SIZE_ORDER[sorted[0]] >= 2) {
      // Big spread between measurements
      for (const [key, size] of Object.entries(perMeasurement)) {
        if (size !== recommendedSize && size !== 'below XS' && size !== 'above XXL') {
          notes.push(`${capitalize(key)} fits ${size} while overall is ${recommendedSize}`);
        }
      }
      notes.push(`Consider trying ${recommendedSize} and checking fit at ${Object.entries(perMeasurement).filter(([, s]) => s !== recommendedSize).map(([k]) => k).join(', ')}`);
    }
  }

  if (Object.values(perMeasurement).includes('above XXL')) {
    const above = Object.entries(perMeasurement).filter(([, s]) => s === 'above XXL').map(([k]) => k);
    notes.push(`${above.map(capitalize).join(', ')} exceed${above.length === 1 ? 's' : ''} standard XXL range`);
  }
  if (Object.values(perMeasurement).includes('below XS')) {
    const below = Object.entries(perMeasurement).filter(([, s]) => s === 'below XS').map(([k]) => k);
    notes.push(`${below.map(capitalize).join(', ')} ${below.length === 1 ? 'is' : 'are'} below standard XS range`);
  }

  return { recommendedSize, perMeasurement, notes };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
