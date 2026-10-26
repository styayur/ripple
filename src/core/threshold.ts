import type { Score } from './types';

export function thresholdIds(scores: readonly Score[], percent: number): ReadonlySet<string> {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('Threshold must be between 0 and 100.');
  }
  return new Set(
    scores
      .filter((score) => !score.excluded && score.total >= percent / 100)
      .map((score) => score.id),
  );
}
