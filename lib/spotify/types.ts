export interface SpotifyImage {
  url: string;
  height?: number | null;
  width?: number | null;
}

export interface SpotifyUser {
  id: string;
  displayName: string;
  imageUrl: string | null;
  externalUrl: string | null;
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  imageUrl: string | null;
  ownerName: string;
  ownerId: string;
  itemCount: number | null;
  public: boolean | null;
  collaborative: boolean;
  externalUrl: string;
  isReadableSource: boolean;
  unavailableReason: string | null;
}

export interface NormalizedTrack {
  spotifyId: string;
  spotifyUri: string;
  name: string;
  artists: string[];
  album: string;
  imageUrl: string | null;
  externalUrl: string;
  isrc: string | null;
  durationMs: number;
}

export interface SpotifyPlaylistReview extends SpotifyPlaylistSummary {
  tracks: NormalizedTrack[];
  skippedItemCount: number;
}

export interface SpotifyPaging<T> {
  items: T[];
  limit: number;
  offset: number;
  total: number;
  next: string | null;
}

export interface SpotifyApiImage {
  url?: unknown;
  height?: unknown;
  width?: unknown;
}

export interface SpotifyApiUser {
  id?: unknown;
  account_id?: unknown;
  display_name?: unknown;
  images?: unknown;
  external_urls?: unknown;
}

export interface SpotifyApiPlaylist {
  id?: unknown;
  name?: unknown;
  images?: unknown;
  owner?: unknown;
  public?: unknown;
  collaborative?: unknown;
  external_urls?: unknown;
  items?: unknown;
  tracks?: unknown;
}

export interface SpotifyApiPlaylistItem {
  is_local?: unknown;
  item?: unknown;
  track?: unknown;
}
