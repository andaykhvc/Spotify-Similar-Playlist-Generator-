import { SpotifyApiError } from "@/lib/spotify/errors";
import type { SpotifyPaging } from "@/lib/spotify/types";

interface PaginationOptions {
  pageSize: number;
  maxPages: number;
}

export async function paginateSpotify<T>(
  fetchPage: (offset: number, limit: number) => Promise<SpotifyPaging<T>>,
  { pageSize, maxPages }: PaginationOptions,
): Promise<T[]> {
  if (pageSize < 1 || maxPages < 1) {
    throw new Error("Pagination limits must be positive");
  }

  const results: T[] = [];
  let offset = 0;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await fetchPage(offset, pageSize);

    if (!Array.isArray(page.items)) {
      throw new SpotifyApiError(
        "Spotify sayfalama yanıtı geçersiz.",
        502,
        "invalid_response",
      );
    }

    results.push(...page.items);

    if (!page.next || page.items.length === 0 || results.length >= page.total) {
      return results;
    }

    const nextOffset = page.offset + page.items.length;

    if (nextOffset <= offset) {
      throw new SpotifyApiError(
        "Spotify sayfalama yanıtı ilerlemedi.",
        502,
        "invalid_response",
      );
    }

    offset = nextOffset;
  }

  throw new SpotifyApiError(
    "Bu çalma listesi güvenli işleme sınırını aşıyor.",
    422,
    "pagination_limit",
  );
}
