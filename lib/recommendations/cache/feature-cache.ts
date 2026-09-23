import type { ProviderFeatures } from "@/lib/recommendations/features/types";
import type { ProviderName } from "@/lib/recommendations/types";

// One instance per generation request. No account, playlist, or listening-history keys.
export class RequestFeatureCache {
  private readonly entries = new Map<string, ProviderFeatures | null>();

  private key(provider: ProviderName, schemaVersion: string, stableIdentifier: string): string {
    return `${provider}:${schemaVersion}:${stableIdentifier}`;
  }

  has(provider: ProviderName, schemaVersion: string, stableIdentifier: string): boolean {
    return this.entries.has(this.key(provider, schemaVersion, stableIdentifier));
  }

  get(provider: ProviderName, schemaVersion: string, stableIdentifier: string): ProviderFeatures | null | undefined {
    return this.entries.get(this.key(provider, schemaVersion, stableIdentifier));
  }

  set(provider: ProviderName, schemaVersion: string, stableIdentifier: string, features: ProviderFeatures | null): void {
    this.entries.set(this.key(provider, schemaVersion, stableIdentifier), features);
  }
}
