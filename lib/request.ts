import { getSpotifyEnvironment } from "@/lib/env";

export function hasValidRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === getSpotifyEnvironment().appUrl;
  } catch {
    return false;
  }
}
