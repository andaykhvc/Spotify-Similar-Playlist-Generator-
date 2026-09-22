import { describe, expect, it } from "vitest";
import { isConservativeSpotifyMatch } from "@/lib/spotify/tracks";
import type { NormalizedTrack } from "@/lib/spotify/types";

const spotifyTrack: NormalizedTrack = {
  spotifyId: "1234567890123456789012",
  spotifyUri: "spotify:track:1234567890123456789012",
  name: "A Song (feat. Guest)",
  artists: ["The Band"],
  album: "Album",
  imageUrl: null,
  externalUrl: "https://open.spotify.com/track/1234567890123456789012",
  isrc: "ABC123",
  durationMs: 180_000,
};

describe("Spotify candidate matching", () => {
  it("accepts exact ISRC and normalized artist/title within duration tolerance", () => {
    expect(isConservativeSpotifyMatch({
      name: "Wrong",
      artists: ["Wrong"],
      isrc: "abc123",
      durationMs: null,
    }, spotifyTrack)).toBe(true);
    expect(isConservativeSpotifyMatch({
      name: "A Song ft. Guest",
      artists: ["the band"],
      isrc: null,
      durationMs: 184_000,
    }, spotifyTrack)).toBe(true);
  });

  it("does not collapse distinct live and remix versions", () => {
    expect(isConservativeSpotifyMatch({
      name: "A Song (Live)",
      artists: ["The Band"],
      isrc: null,
      durationMs: 180_000,
    }, { ...spotifyTrack, name: "A Song (Remix)" })).toBe(false);
  });
});
