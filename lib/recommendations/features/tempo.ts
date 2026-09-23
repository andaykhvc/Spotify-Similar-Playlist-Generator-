export function tempoDistance(
  a: number | null,
  b: number | null,
  alternativeA: number | null = null,
  alternativeB: number | null = null,
): number | null {
  const left = [a, alternativeA].filter((value): value is number => value !== null && Number.isFinite(value) && value >= 35 && value <= 260);
  const right = [b, alternativeB].filter((value): value is number => value !== null && Number.isFinite(value) && value >= 35 && value <= 260);
  if (left.length === 0 || right.length === 0) return null;
  let best = Infinity;
  for (const x of left) for (const y of right) {
    for (const multiplier of [0.5, 1, 2]) {
      const adjusted = y * multiplier;
      if (adjusted < 35 || adjusted > 260) continue;
      best = Math.min(best, Math.abs(Math.log2(x / adjusted)));
    }
  }
  return Math.min(1, best / 0.45);
}
