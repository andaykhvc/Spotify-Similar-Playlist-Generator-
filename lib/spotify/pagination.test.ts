import { describe, expect, it } from "vitest";
import { SpotifyApiError } from "@/lib/spotify/errors";
import { paginateSpotify } from "@/lib/spotify/pagination";

describe("paginateSpotify", () => {
  it("fetches every page using the returned progress", async () => {
    const offsets: number[] = [];
    const values = await paginateSpotify<number>(
      async (offset, limit) => {
        offsets.push(offset);
        const all = [1, 2, 3, 4, 5];
        const items = all.slice(offset, offset + limit);
        return {
          items,
          offset,
          limit,
          total: all.length,
          next: offset + items.length < all.length ? "next" : null,
        };
      },
      { pageSize: 2, maxPages: 4 },
    );

    expect(values).toEqual([1, 2, 3, 4, 5]);
    expect(offsets).toEqual([0, 2, 4]);
  });

  it("stops when Spotify returns an empty page", async () => {
    const values = await paginateSpotify<string>(
      async () => ({
        items: [],
        offset: 0,
        limit: 50,
        total: 10,
        next: "next",
      }),
      { pageSize: 50, maxPages: 2 },
    );

    expect(values).toEqual([]);
  });

  it("fails safely when the maximum page count is reached", async () => {
    await expect(
      paginateSpotify<number>(
        async (offset) => ({
          items: [offset],
          offset,
          limit: 1,
          total: 100,
          next: "next",
        }),
        { pageSize: 1, maxPages: 2 },
      ),
    ).rejects.toMatchObject<Partial<SpotifyApiError>>({
      code: "pagination_limit",
    });
  });
});
