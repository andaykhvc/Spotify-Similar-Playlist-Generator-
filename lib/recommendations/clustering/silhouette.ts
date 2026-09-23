export function silhouetteScore(matrix: number[][], labels: number[]): number {
  if (matrix.length < 3 || new Set(labels).size < 2) return 0;
  let sum = 0;
  for (let index = 0; index < labels.length; index += 1) {
    const own = labels[index];
    const ownDistances: number[] = [];
    const other = new Map<number, number[]>();
    for (let neighbor = 0; neighbor < labels.length; neighbor += 1) {
      if (index === neighbor) continue;
      if (labels[neighbor] === own) ownDistances.push(matrix[index][neighbor]);
      else other.set(labels[neighbor], [...(other.get(labels[neighbor]) ?? []), matrix[index][neighbor]]);
    }
    if (ownDistances.length === 0) continue;
    const a = ownDistances.reduce((total, value) => total + value, 0) / ownDistances.length;
    const b = Math.min(...[...other.values()].map((distances) =>
      distances.reduce((total, value) => total + value, 0) / distances.length));
    sum += (b - a) / Math.max(a, b, 1e-9);
  }
  return sum / labels.length;
}
