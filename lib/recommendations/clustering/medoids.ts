import { ENGINE_LIMITS } from "@/lib/recommendations/recommendation-config";
import { silhouetteScore } from "@/lib/recommendations/clustering/silhouette";

export interface ClusteringResult {
  labels: number[];
  medoids: number[];
  silhouette: number;
  clusterCount: number;
}

export function pairwiseMatrix<T>(items: T[], distance: (a: T, b: T) => number): number[][] {
  const matrix = Array.from({ length: items.length }, () => new Array<number>(items.length).fill(0));
  for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) {
    const value = Math.max(0, Math.min(1, distance(items[i], items[j])));
    matrix[i][j] = value;
    matrix[j][i] = value;
  }
  return matrix;
}

function clusterAtK(matrix: number[][], k: number): ClusteringResult {
  const n = matrix.length;
  if (n === 0) return { labels: [], medoids: [], silhouette: 0, clusterCount: 0 };
  if (k === 1) {
    const medoid = Array.from({ length: n }, (_, index) => index)
      .sort((a, b) => matrix[a].reduce((x, y) => x + y, 0) - matrix[b].reduce((x, y) => x + y, 0) || a - b)[0];
    return { labels: new Array<number>(n).fill(0), medoids: [medoid], silhouette: 0, clusterCount: 1 };
  }

  const medoids = [clusterAtK(matrix, 1).medoids[0]];
  while (medoids.length < k) {
    let best = -1;
    let bestDistance = -1;
    for (let i = 0; i < n; i += 1) {
      if (medoids.includes(i)) continue;
      const nearest = Math.min(...medoids.map((medoid) => matrix[i][medoid]));
      if (nearest > bestDistance + 1e-10) { best = i; bestDistance = nearest; }
    }
    medoids.push(best);
  }

  let labels = new Array<number>(n).fill(0);
  for (let iteration = 0; iteration < 15; iteration += 1) {
    labels = labels.map((_, index) => {
      let choice = 0;
      for (let group = 1; group < medoids.length; group += 1) {
        if (matrix[index][medoids[group]] < matrix[index][medoids[choice]] - 1e-10) choice = group;
      }
      return choice;
    });
    const next = medoids.map((medoid, group) => {
      const members = labels.map((label, index) => label === group ? index : -1).filter((index) => index >= 0);
      if (members.length === 0) return medoid;
      let best = medoid;
      let bestCost = Infinity;
      for (const candidate of members) {
        const cost = members.reduce((sum, item) => sum + matrix[candidate][item], 0);
        if (cost < bestCost - 1e-10 || (Math.abs(cost - bestCost) <= 1e-10 && candidate < best)) {
          best = candidate;
          bestCost = cost;
        }
      }
      return best;
    });
    if (next.every((value, index) => value === medoids[index])) break;
    medoids.splice(0, medoids.length, ...next);
  }
  return { labels, medoids, silhouette: silhouetteScore(matrix, labels), clusterCount: k };
}

export function selectMedoidClusters(matrix: number[][], maximum = ENGINE_LIMITS.maxClusters): ClusteringResult {
  const n = matrix.length;
  if (n < 8) return clusterAtK(matrix, 1);
  const upper = Math.min(maximum, Math.floor(n / 4));
  let best = clusterAtK(matrix, 1);
  let bestAdjusted = 0.12;
  for (let k = 2; k <= upper; k += 1) {
    const result = clusterAtK(matrix, k);
    const adjusted = result.silhouette - 0.018 * k;
    if (adjusted > bestAdjusted) { best = result; bestAdjusted = adjusted; }
  }
  return best;
}
