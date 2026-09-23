import { CONSENSUS_WEIGHTS } from "@/lib/recommendations/recommendation-config";
import { selectMedoidClusters, type ClusteringResult } from "@/lib/recommendations/clustering/medoids";

export interface ConsensusResult extends ClusteringResult {
  association: number[][];
  confidence: number[];
  providerAgreement: number;
}

export function coAssociationMatrix(reccoLabels: number[], freqLabels: number[]): number[][] {
  if (reccoLabels.length !== freqLabels.length) throw new Error("Provider assignments must have equal length");
  return reccoLabels.map((_, i) => reccoLabels.map((__, j) => {
    if (i === j) return 1;
    return CONSENSUS_WEIGHTS.reccobeats * Number(reccoLabels[i] === reccoLabels[j]) +
      CONSENSUS_WEIGHTS.freqblog * Number(freqLabels[i] === freqLabels[j]);
  }));
}

export function buildConsensus(reccoLabels: number[], freqLabels: number[]): ConsensusResult {
  const association = coAssociationMatrix(reccoLabels, freqLabels);
  const distance = association.map((row) => row.map((value) => 1 - value));
  const clustering = selectMedoidClusters(distance);
  const confidence = clustering.labels.map((label, index) => {
    const neighbors = clustering.labels.map((other, at) => other === label && at !== index ? at : -1).filter((at) => at >= 0);
    if (neighbors.length === 0) return 0.35;
    return neighbors.reduce((sum, at) => sum + association[index][at], 0) / neighbors.length;
  });
  let agreementPairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < reccoLabels.length; i += 1) for (let j = i + 1; j < reccoLabels.length; j += 1) {
    agreementPairs += Number((reccoLabels[i] === reccoLabels[j]) === (freqLabels[i] === freqLabels[j]));
    totalPairs += 1;
  }
  return {
    ...clustering, association, confidence,
    providerAgreement: totalPairs ? agreementPairs / totalPairs : 0,
  };
}
