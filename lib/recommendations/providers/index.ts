import { ProviderError } from "@/lib/recommendations/errors";
import type {
  RecommendationCandidate,
  RecommendationProvider,
  RecommendationProviderRequest,
} from "@/lib/recommendations/types";

export interface ProviderRunResult {
  candidates: RecommendationCandidate[];
  successes: string[];
  failures: { provider: string; status: number; retryAfterSeconds: number | null }[];
}

export async function runRecommendationProviders(
  providers: RecommendationProvider[],
  request: RecommendationProviderRequest,
): Promise<ProviderRunResult> {
  const settled = await Promise.allSettled(
    providers.map(async (provider) => ({
      provider: provider.name,
      candidates: await provider.recommend(request),
    })),
  );
  const result: ProviderRunResult = { candidates: [], successes: [], failures: [] };
  settled.forEach((entry, index) => {
    const provider = providers[index];
    if (entry.status === "fulfilled") {
      result.successes.push(entry.value.provider);
      result.candidates.push(...entry.value.candidates);
    } else {
      const error = entry.reason;
      result.failures.push({
        provider: provider.name,
        status: error instanceof ProviderError ? error.status : 503,
        retryAfterSeconds: error instanceof ProviderError ? error.retryAfterSeconds : null,
      });
    }
  });
  return result;
}
