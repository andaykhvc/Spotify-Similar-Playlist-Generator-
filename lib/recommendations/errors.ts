export type RecommendationErrorCode =
  | "feature_disabled"
  | "provider_unavailable"
  | "provider_rate_limited"
  | "no_usable_tracks"
  | "no_matches"
  | "invalid_request";

export class RecommendationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: RecommendationErrorCode,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "RecommendationError";
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
