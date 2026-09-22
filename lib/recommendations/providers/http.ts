import { ProviderError } from "@/lib/recommendations/errors";

const MAX_RETRY_WAIT_SECONDS = 5;

function retryAfterSeconds(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchProviderJson(
  provider: string,
  url: URL,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<unknown> {
  let attempt = 0;
  while (attempt < 2) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetcher(url, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      throw new ProviderError(
        error instanceof Error && error.name === "AbortError"
          ? `${provider} request timed out`
          : `${provider} request failed`,
        provider,
        503,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) {
      const seconds = retryAfterSeconds(response);
      if (attempt === 0 && seconds !== null && seconds <= MAX_RETRY_WAIT_SECONDS) {
        attempt += 1;
        await wait(seconds * 1000);
        continue;
      }
      throw new ProviderError(`${provider} rate limit reached`, provider, 429, seconds);
    }
    if (!response.ok) {
      throw new ProviderError(`${provider} returned HTTP ${response.status}`, provider, response.status);
    }
    try {
      return await response.json();
    } catch {
      throw new ProviderError(`${provider} returned invalid JSON`, provider, 502);
    }
  }
  throw new ProviderError(`${provider} request failed`, provider, 503);
}
