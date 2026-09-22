export type SpotifyErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "spotify_unavailable"
  | "invalid_response"
  | "pagination_limit";

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: SpotifyErrorCode,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

export function spotifyErrorFromStatus(
  status: number,
  retryAfterSeconds: number | null = null,
): SpotifyApiError {
  switch (status) {
    case 400:
      return new SpotifyApiError(
        "Spotify bu isteği kabul etmedi.",
        400,
        "bad_request",
      );
    case 401:
      return new SpotifyApiError(
        "Spotify bağlantınızın süresi doldu. Lütfen yeniden bağlanın.",
        401,
        "unauthorized",
      );
    case 403:
      return new SpotifyApiError(
        "Spotify bu içeriğe uygulama üzerinden erişime izin vermiyor. Development Mode'da yalnızca size ait veya birlikte düzenlediğiniz çalma listeleri okunabilir.",
        403,
        "forbidden",
      );
    case 404:
      return new SpotifyApiError(
        "Çalma listesi bulunamadı veya artık erişilebilir değil.",
        404,
        "not_found",
      );
    case 429:
      return new SpotifyApiError(
        "Spotify istek sınırına ulaşıldı. Lütfen biraz sonra tekrar deneyin.",
        429,
        "rate_limited",
        retryAfterSeconds,
      );
    default:
      if (status >= 500) {
        return new SpotifyApiError(
          "Spotify şu anda yanıt veremiyor. Lütfen biraz sonra tekrar deneyin.",
          503,
          "spotify_unavailable",
        );
      }

      return new SpotifyApiError(
        "Spotify'dan beklenmeyen bir yanıt alındı.",
        502,
        "invalid_response",
      );
  }
}
