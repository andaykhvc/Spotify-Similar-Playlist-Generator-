import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { cookies } from "next/headers";
import { getSpotifyEnvironment } from "@/lib/env";

export const SESSION_COOKIE_NAME = "spotify_session";
export const OAUTH_COOKIE_NAME = "spotify_oauth";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const OAUTH_MAX_AGE_SECONDS = 60 * 10;

export interface SpotifySession {
  version: 1;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export interface SpotifyOAuthTransaction {
  version: 1;
  state: string;
  codeVerifier: string;
  createdAt: number;
}

function encryptionKey(): Buffer {
  return createHash("sha256")
    .update(getSpotifyEnvironment().sessionSecret, "utf8")
    .digest();
}

export function seal(value: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, encrypted, tag]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function unseal<T>(value: string): T | null {
  try {
    const parts = value.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const [ivPart, encryptedPart, tagPart] = parts;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");

    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

function secureCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    priority: "high" as const,
  };
}

export async function getSpotifySession(): Promise<SpotifySession | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!value) {
    return null;
  }

  const session = unseal<SpotifySession>(value);

  if (
    !session ||
    session.version !== 1 ||
    !session.accessToken ||
    !session.refreshToken ||
    !Number.isFinite(session.expiresAt)
  ) {
    return null;
  }

  return session;
}

export async function setSpotifySession(
  session: SpotifySession,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    seal(session),
    secureCookieOptions(SESSION_MAX_AGE_SECONDS),
  );
}

export async function clearSpotifySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    ...secureCookieOptions(0),
    expires: new Date(0),
  });
}

export async function getOAuthTransaction(): Promise<SpotifyOAuthTransaction | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(OAUTH_COOKIE_NAME)?.value;

  return value ? unseal<SpotifyOAuthTransaction>(value) : null;
}

export async function setOAuthTransaction(
  transaction: SpotifyOAuthTransaction,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    OAUTH_COOKIE_NAME,
    seal(transaction),
    secureCookieOptions(OAUTH_MAX_AGE_SECONDS),
  );
}

export async function clearOAuthTransaction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_COOKIE_NAME, "", {
    ...secureCookieOptions(0),
    expires: new Date(0),
  });
}
