"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Artwork } from "@/components/artwork";
import type { SpotifyPlaylistReview } from "@/lib/spotify/types";

interface ReviewResponse {
  playlist: SpotifyPlaylistReview;
}

interface ErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

async function fetchPlaylistReview(
  playlistId: string,
): Promise<
  | { playlist: SpotifyPlaylistReview; error: null }
  | { playlist: null; error: { code: string; message: string } }
> {
  try {
    const response = await fetch(
      `/api/spotify/playlists/${encodeURIComponent(playlistId)}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      let payload: ErrorPayload = {};
      try {
        payload = (await response.json()) as ErrorPayload;
      } catch {
        // The generic fallback below is intentionally used.
      }
      return {
        playlist: null,
        error: {
          code: payload.error?.code ?? "unknown_error",
          message: payload.error?.message ?? "Çalma listesi yüklenemedi.",
        },
      };
    }

    const body = (await response.json()) as ReviewResponse;
    return { playlist: body.playlist, error: null };
  } catch {
    return {
      playlist: null,
      error: {
        code: "network_error",
        message: "Çalma listesi yüklenemedi. Bağlantını kontrol edip tekrar dene.",
      },
    };
  }
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function ReviewSkeleton() {
  return (
    <div className="py-10 sm:py-14" aria-live="polite" aria-busy="true">
      <div className="surface rounded-[2rem] p-5 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="skeleton size-40 rounded-2xl" />
          <div className="flex-1 py-3">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton mt-5 h-10 max-w-md rounded" />
            <div className="skeleton mt-4 h-5 w-52 rounded" />
          </div>
        </div>
      </div>
      <div className="mt-8 space-y-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="skeleton h-20 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function PlaylistReviewClient({
  playlistId,
  recommendationsEnabled,
}: {
  playlistId: string;
  recommendationsEnabled: boolean;
}) {
  const [playlist, setPlaylist] = useState<SpotifyPlaylistReview | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const loadPlaylist = useCallback(async () => {
    setError(null);
    const result = await fetchPlaylistReview(playlistId);
    setPlaylist(result.playlist);
    setError(result.error);
  }, [playlistId]);

  useEffect(() => {
    let isCurrent = true;

    void fetchPlaylistReview(playlistId).then((result) => {
      if (isCurrent) {
        setPlaylist(result.playlist);
        setError(result.error);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [playlistId]);

  if (!playlist && !error) {
    return <ReviewSkeleton />;
  }

  if (error) {
    const isForbidden = error.code === "forbidden";
    const isExpired = error.code === "unauthorized";

    return (
      <section className="mx-auto flex min-h-[65vh] max-w-xl items-center py-12 text-center">
        <div className="surface w-full rounded-[2rem] p-8 sm:p-12">
          <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-amber-400/15 text-2xl">!</span>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">
            {isForbidden ? "Bu liste şu anda okunamıyor" : isExpired ? "Spotify bağlantısının süresi doldu" : "Çalma listesi yüklenemedi"}
          </h1>
          <p className="mt-4 leading-7 text-[var(--muted)]">{error.message}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            {isExpired ? (
              <Link href="/api/auth/spotify/login" className="rounded-full bg-[var(--foreground)] px-6 py-3 font-bold text-[var(--background)]">Yeniden bağla</Link>
            ) : !isForbidden ? (
              <button type="button" onClick={() => void loadPlaylist()} className="rounded-full bg-[var(--foreground)] px-6 py-3 font-bold text-[var(--background)]">Tekrar dene</button>
            ) : null}
            <Link href={isForbidden ? `/dashboard?unavailable=${encodeURIComponent(playlistId)}` : "/dashboard"} className="rounded-full border border-[var(--line)] px-6 py-3 font-bold">Listelerime dön</Link>
          </div>
        </div>
      </section>
    );
  }

  if (!playlist) {
    return null;
  }

  return (
    <div className="py-8 sm:py-12">
      <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full text-sm font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]">
        <span aria-hidden="true">←</span> Çalma listelerim
      </Link>

      <section className="surface mt-6 rounded-[2rem] p-5 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <a href={playlist.externalUrl} target="_blank" rel="noreferrer" className="w-fit overflow-hidden rounded-2xl" aria-label={`${playlist.name} çalma listesini Spotify'da aç`}>
            <Artwork src={playlist.imageUrl} alt={`${playlist.name} kapak görseli`} size={176} className="size-36 rounded-2xl sm:size-44" />
          </a>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Seçilen çalma listesi</p>
            <h1 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">{playlist.name}</h1>
            <p className="mt-4 text-sm text-[var(--muted)]">
              {playlist.ownerName} · {playlist.tracks.length} kullanılabilir parça
              {playlist.skippedItemCount > 0 ? ` · ${playlist.skippedItemCount} desteklenmeyen öğe atlandı` : ""}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">
                {playlist.public === true ? "Herkese açık" : playlist.public === false ? "Gizli" : "Görünürlük bilinmiyor"}
              </span>
              {playlist.collaborative && <span className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">Ortak liste</span>}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="tracks-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">İncele</p>
            <h2 id="tracks-heading" className="mt-2 text-3xl font-semibold tracking-tight">Parçalar</h2>
          </div>
          <span className="text-sm text-[var(--muted)]">{playlist.tracks.length} parça</span>
        </div>

        {playlist.tracks.length === 0 ? (
          <div className="surface mt-6 rounded-[2rem] px-6 py-16 text-center">
            <p className="text-xl font-semibold">Kullanılabilir parça bulunamadı.</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Yerel dosyalar, podcast bölümleri ve kullanılamayan parçalar kaynak olarak kullanılamaz.</p>
          </div>
        ) : (
          <ol className="mt-6 space-y-2">
            {playlist.tracks.map((track, index) => (
              <li key={`${track.spotifyUri}-${index}`} className="group grid grid-cols-[auto_3rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-transparent px-2 py-2 transition hover:border-[var(--line)] hover:bg-[var(--panel)] sm:grid-cols-[2rem_3.5rem_minmax(0,1.2fr)_minmax(0,0.8fr)_auto] sm:gap-4 sm:px-4">
                <span className="hidden text-right text-sm tabular-nums text-[var(--muted)] sm:block">{index + 1}</span>
                <a href={track.externalUrl} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg" aria-label={`${track.name} parçasını Spotify'da aç`}>
                  <Artwork src={track.imageUrl} alt={`${track.album} albüm kapağı`} size={56} className="size-12 rounded-lg sm:size-14" />
                </a>
                <div className="min-w-0">
                  <a href={track.externalUrl} target="_blank" rel="noreferrer" className="block truncate font-semibold hover:underline">{track.name}</a>
                  <p className="mt-1 truncate text-sm text-[var(--muted)]">{track.artists.join(", ")}</p>
                </div>
                <p className="hidden truncate text-sm text-[var(--muted)] sm:block">{track.album}</p>
                <span className="text-xs tabular-nums text-[var(--muted)] sm:text-sm">{formatDuration(track.durationMs)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="surface sticky bottom-4 z-10 mt-10 flex flex-col gap-4 rounded-[1.5rem] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="font-semibold">Kaynak listen hazır.</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {recommendationsEnabled
              ? "Yeni listen için benzer müzikleri bul."
              : "Öneri özelliği bu dağıtımda devre dışı."}
          </p>
        </div>
        {recommendationsEnabled && playlist.tracks.length > 0 ? (
          <Link
            href={`/playlist/${encodeURIComponent(playlist.id)}/similar`}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-7 font-bold text-[var(--background)]"
          >
            Benzer çalma listesi oluştur
          </Link>
        ) : (
          <button type="button" disabled className="min-h-12 rounded-full bg-[var(--foreground)] px-7 font-bold text-[var(--background)] opacity-40 disabled:cursor-not-allowed">
            Benzer çalma listesi oluştur
          </button>
        )}
      </section>
    </div>
  );
}
