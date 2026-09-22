import { seal, unseal } from "@/lib/session";

const TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const TRACK_ID = /^[A-Za-z0-9]{22}$/;
const PLAYLIST_ID = /^[A-Za-z0-9]{22}$/;

interface GenerationAuthorization {
  version: 1;
  userId: string;
  sourcePlaylistId: string;
  allowedSpotifyIds: string[];
  createdAt: number;
  expiresAt: number;
}

export function createGenerationToken(
  userId: string,
  sourcePlaylistId: string,
  allowedSpotifyIds: string[],
  now = Date.now(),
): string {
  return seal({
    version: 1,
    userId,
    sourcePlaylistId,
    allowedSpotifyIds,
    createdAt: now,
    expiresAt: now + TOKEN_LIFETIME_MS,
  } satisfies GenerationAuthorization);
}

export function validateGenerationToken(
  token: unknown,
  userId: string,
  now = Date.now(),
): GenerationAuthorization | null {
  if (typeof token !== "string" || token.length < 20 || token.length > 20_000) return null;
  const payload = unseal<GenerationAuthorization>(token);
  if (
    !payload ||
    payload.version !== 1 ||
    payload.userId !== userId ||
    !PLAYLIST_ID.test(payload.sourcePlaylistId) ||
    !Array.isArray(payload.allowedSpotifyIds) ||
    payload.allowedSpotifyIds.length === 0 ||
    payload.allowedSpotifyIds.length > 100 ||
    payload.allowedSpotifyIds.some((id) => !TRACK_ID.test(id)) ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt < now
  ) {
    return null;
  }
  return payload;
}
