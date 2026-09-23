export function pitchClassDistance(a: number | null, b: number | null): number | null {
  if (a === null || b === null || !Number.isInteger(a) || !Number.isInteger(b)) return null;
  if (a < 0 || a > 11 || b < 0 || b > 11) return null;
  const steps = Math.abs(a - b);
  return Math.min(steps, 12 - steps) / 6;
}

export function camelotDistance(a: string | null, b: string | null): number | null {
  const pattern = /^(1[0-2]|[1-9])([AB])$/i;
  const left = a?.match(pattern);
  const right = b?.match(pattern);
  if (!left || !right) return null;
  const leftNumber = Number(left[1]);
  const rightNumber = Number(right[1]);
  const steps = Math.abs(leftNumber - rightNumber);
  const wheel = Math.min(steps, 12 - steps);
  if (wheel === 0) return left[2].toUpperCase() === right[2].toUpperCase() ? 0 : 0.2;
  if (wheel === 1 && left[2].toUpperCase() === right[2].toUpperCase()) return 0.25;
  return Math.min(1, 0.3 + wheel / 6 + (left[2].toUpperCase() === right[2].toUpperCase() ? 0 : 0.1));
}
