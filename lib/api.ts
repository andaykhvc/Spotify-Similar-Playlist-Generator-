import { NextResponse } from "next/server";
import { SpotifyApiError } from "@/lib/spotify/errors";
import { RecommendationError } from "@/lib/recommendations/errors";

function markPrivate(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export function privateJsonResponse(
  body: unknown,
  init?: ResponseInit,
): NextResponse {
  return markPrivate(NextResponse.json(body, init));
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof RecommendationError) {
    const response = privateJsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
        },
      },
      { status: error.status },
    );
    if (error.retryAfterSeconds !== null) {
      response.headers.set("Retry-After", String(error.retryAfterSeconds));
    }
    return response;
  }

  if (error instanceof SpotifyApiError) {
    const response = privateJsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
        },
      },
      { status: error.status },
    );

    if (error.retryAfterSeconds !== null) {
      response.headers.set("Retry-After", String(error.retryAfterSeconds));
    }

    return response;
  }

  console.error("[application] Unexpected server error", {
    error: error instanceof Error ? error.name : "UnknownError",
  });

  return privateJsonResponse(
    {
      error: {
        code: "internal_error",
        message: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
      },
    },
    { status: 500 },
  );
}
