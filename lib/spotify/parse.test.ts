import { describe, expect, it } from "vitest";
import { parseSpotifyPlaylistInput } from "@/lib/spotify/parse";

const playlistId = "37i9dQZF1DXcBWIGoYBM5M";

describe("parseSpotifyPlaylistInput", () => {
  it("accepts a bare Spotify playlist ID", () => {
    expect(parseSpotifyPlaylistInput(playlistId)).toBe(playlistId);
  });

  it("accepts canonical and localized Spotify playlist URLs", () => {
    expect(
      parseSpotifyPlaylistInput(
        `https://open.spotify.com/playlist/${playlistId}?si=abc123`,
      ),
    ).toBe(playlistId);
    expect(
      parseSpotifyPlaylistInput(
        `https://open.spotify.com/intl-tr/playlist/${playlistId}`,
      ),
    ).toBe(playlistId);
  });

  it("accepts a Spotify playlist URI", () => {
    expect(parseSpotifyPlaylistInput(`spotify:playlist:${playlistId}`)).toBe(
      playlistId,
    );
  });

  it.each([
    "",
    "not-a-playlist",
    "https://example.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    "http://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    "https://open.spotify.com/track/37i9dQZF1DXcBWIGoYBM5M",
    "https://open.spotify.com/playlist/too-short",
    "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M/extra",
  ])("rejects malformed or unsafe input: %s", (input) => {
    expect(parseSpotifyPlaylistInput(input)).toBeNull();
  });
});
