function chooseTwo(value: number): number { return value * (value - 1) / 2; }

export function adjustedRandIndex(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const contingency = new Map<string, number>();
  const row = new Map<number, number>();
  const column = new Map<number, number>();
  left.forEach((label, index) => {
    const key = `${label}:${right[index]}`;
    contingency.set(key, (contingency.get(key) ?? 0) + 1);
    row.set(label, (row.get(label) ?? 0) + 1);
    column.set(right[index], (column.get(right[index]) ?? 0) + 1);
  });
  const joined = [...contingency.values()].reduce((sum, value) => sum + chooseTwo(value), 0);
  const rows = [...row.values()].reduce((sum, value) => sum + chooseTwo(value), 0);
  const columns = [...column.values()].reduce((sum, value) => sum + chooseTwo(value), 0);
  const expected = rows * columns / chooseTwo(left.length);
  const maximum = (rows + columns) / 2;
  if (maximum === expected) return rows === columns && joined === rows ? 1 : 0;
  return (joined - expected) / (maximum - expected);
}
