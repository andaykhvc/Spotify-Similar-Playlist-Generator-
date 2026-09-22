import { describe, expect, it } from "vitest";
import {
  createCodeChallenge,
  isAccessTokenExpiring,
  validateOAuthState,
} from "@/lib/spotify/auth";

describe("OAuth helpers", () => {
  it("creates the RFC 7636 S256 challenge", () => {
    expect(
      createCodeChallenge(
        "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      ),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("validates matching, fresh OAuth state", () => {
    const now = 1_800_000_000_000;
    expect(validateOAuthState("safe-state", "safe-state", now - 1_000, now)).toBe(
      true,
    );
  });

  it("rejects mismatched, future, and expired OAuth state", () => {
    const now = 1_800_000_000_000;
    expect(validateOAuthState("safe-state", "other", now - 1_000, now)).toBe(
      false,
    );
    expect(validateOAuthState("safe-state", "safe-state", now + 1, now)).toBe(
      false,
    );
    expect(
      validateOAuthState("safe-state", "safe-state", now - 10 * 60 * 1_000 - 1, now),
    ).toBe(false);
  });
});

describe("access token expiry", () => {
  it("refreshes within the one-minute safety window", () => {
    const now = 1_800_000_000_000;
    expect(isAccessTokenExpiring(now + 30_000, now)).toBe(true);
    expect(isAccessTokenExpiring(now + 60_000, now)).toBe(true);
    expect(isAccessTokenExpiring(now + 60_001, now)).toBe(false);
  });

  it("treats invalid and expired timestamps as expiring", () => {
    const now = 1_800_000_000_000;
    expect(isAccessTokenExpiring(Number.NaN, now)).toBe(true);
    expect(isAccessTokenExpiring(now - 1, now)).toBe(true);
  });
});
