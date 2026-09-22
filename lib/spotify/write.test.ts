import { describe, expect, it } from "vitest";
import { chunkSpotifyItems, sanitizePlaylistName } from "@/lib/spotify/write";

describe("Spotify playlist writes", () => {
  it("chunks playlist items at Spotify's 100-item maximum", () => {
    const chunks = chunkSpotifyItems(Array.from({ length: 205 }, (_, index) => index));
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 5]);
  });

  it("sanitizes and limits playlist names", () => {
    expect(sanitizePlaylistName("  Name\n\u0000Here  ")).toBe("Name Here");
    expect(sanitizePlaylistName("x".repeat(150))).toHaveLength(100);
  });
});
