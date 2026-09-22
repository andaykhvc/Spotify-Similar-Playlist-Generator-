const SPOTIFY_PLAYLIST_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

export function parseSpotifyPlaylistInput(input: string): string | null {
  const value = input.trim();

  if (SPOTIFY_PLAYLIST_ID_PATTERN.test(value)) {
    return value;
  }

  const uriMatch = /^spotify:playlist:([A-Za-z0-9]{22})$/.exec(value);

  if (uriMatch) {
    return uriMatch[1];
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "open.spotify.com" ||
    url.username ||
    url.password
  ) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const playlistIndex = segments[0]?.startsWith("intl-") ? 1 : 0;

  if (
    segments.length !== playlistIndex + 2 ||
    segments[playlistIndex] !== "playlist"
  ) {
    return null;
  }

  const playlistId = segments[playlistIndex + 1];
  return SPOTIFY_PLAYLIST_ID_PATTERN.test(playlistId) ? playlistId : null;
}
