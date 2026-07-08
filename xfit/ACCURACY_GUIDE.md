# Body Measurement Validation Guide

This guide defines how Tailor-X should validate scan measurements before making public accuracy claims. Until this study is complete, the product should describe scan output as measurement estimates with confidence indicators, not guaranteed tape-measure replacements.

## Current Position

- The scan engine provides fit-guidance estimates.
- Published claims must be backed by a tape-measure validation study.
- User-facing screens should say "scan confidence" or "estimate confidence" instead of promising exact accuracy.
- Marketing should avoid centimeter precision, percentage accuracy, and compliance claims that are not yet independently verified.

## Validation Study

Run a study with 20 to 50 participants before publishing measurement accuracy claims.

### Participants

- Recruit a range of heights, body shapes, ages, and genders.
- Include multiple clothing fits: close-fitting, typical everyday clothing, and looser clothing.
- Record consent for scan capture, processing, storage, and deletion.
- Do not retain raw images beyond the documented retention window.

### Ground Truth

- Use trained staff and flexible tape measurements.
- Take each tape measurement at least twice.
- Record the median or agreed final value.
- Note posture, clothing, lighting, camera distance, and any capture issues.

### Measurements To Report

Report Mean Absolute Error (MAE), median absolute error, p90 absolute error, and sample count for each body part:

- Height
- Chest or bust
- Waist
- Hips
- Shoulders
- Sleeve
- Inseam
- Thigh
- Neck

### Capture Conditions

Test each participant under realistic conditions:

- Good indoor light
- Lower-light indoor setup
- Plain background
- Mixed or cluttered background
- Front-only capture
- Multi-angle capture
- Calibrated capture with known height or reference object

## Reporting Rules

- Publish MAE by body part, not a single broad "accurate" number.
- Include confidence intervals and sample size.
- Separate results by capture mode and clothing condition.
- Show known limitations plainly.
- Only use centimeter claims after the study supports them.

## Benchmark Harness

Use the local harness to turn study exports into MAE, median error, P90/P95 error, and failure rate by body part.

```bash
npm run benchmark:accuracy:template > study-template.csv
npm run benchmark:accuracy -- study.json
npm run benchmark:accuracy -- study.csv --json
npm run benchmark:accuracy -- --demo
```

The preferred JSON shape is:

```json
[
  {
    "subjectId": "p001",
    "scanId": "scan001",
    "groundTruth": { "chest": 101.2, "waist": 82.4 },
    "scan": { "chest": 100.1, "waist": 85.0 }
  }
]
```

## Product Language

Use:

- "Scan confidence"
- "Measurement estimate"
- "Fit guidance"
- "Validation in progress"
- "Pilot benchmark"

Avoid:

- "Tape-measure accurate"
- "Professional measurements"
- "Guaranteed accuracy"
- Unsupported centimeter ranges
- Unsupported compliance language

## Scan Engine Improvements To Prioritize

1. Add per-body-part confidence, not only one overall score.
2. Store capture-quality metadata with each scan: lighting, blur, pose visibility, distance, angle coverage, calibration mode, and fallback mode.
3. Compare multi-angle results and flag body parts with disagreement.
4. Use known-height or reference-object calibration when available.
5. Add anonymized validation export for study analysis.
6. Track MAE by engine version so improvements are measurable.

## Pilot Readiness Checklist

- Privacy consent cannot be skipped.
- Full privacy policy is linked before scanning.
- Raw image retention is documented.
- Measurement/profile storage uses secure storage or encrypted backend persistence.
- Shared measurement links expire and can be revoked.
- Trial flows are clearly labeled and quota-limited.
- Marketing copy frames web scan, SDKs, ecommerce integrations, and compliance posture as roadmap or pilot scope unless already implemented.
