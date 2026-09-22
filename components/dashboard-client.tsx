"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Artwork } from "@/components/artwork";
import type {
  SpotifyPlaylistSummary,
  SpotifyUser,
} from "@/lib/spotify/types";

interface OverviewResponse {
  user: SpotifyUser;
  playlists: SpotifyPlaylistSummary[];
}

interface ErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

async function responseError(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as ErrorPayload;
    return {
      code: body.error?.code ?? "unknown_error",
      message: body.error?.message ?? "Bir sorun oluştu. Lütfen tekrar deneyin.",
    };
  } catch {
    return {
      code: "unknown_error",
      message: "Bir sorun oluştu. Lütfen tekrar deneyin.",
    };
  }
}

async function fetchOverviewData(): Promise<
  | { overview: OverviewResponse; error: null }
  | { overview: null; error: { code: string; message: string } }
> {
  try {
    const response = await fetch("/api/spotify/overview", {
      cache: "no-store",
    });

    if (!response.ok) {
      return { overview: null, error: await responseError(response) };
    }

    return {
      overview: (await response.json()) as OverviewResponse,
      error: null,
    };
  } catch {
    return {
      overview: null,
      error: {
        code: "network_error",
        message: "Spotify bilgileri yüklenemedi. Bağlantını kontrol edip tekrar dene.",
      },
    };
  }
}

function DashboardSkeleton() {
  return (
    <div className="py-10 sm:py-14" aria-live="polite" aria-busy="true">
      <div className="skeleton h-6 w-36 rounded-full" />
      <div className="skeleton mt-5 h-14 w-full max-w-xl rounded-2xl" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="surface rounded-3xl p-4">
            <div className="skeleton aspect-square rounded-2xl" />
            <div className="skeleton mt-4 h-5 w-3/4 rounded" />
            <div className="skeleton mt-3 h-4 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardClient({
  unavailablePlaylistId,
}: {
  unavailablePlaylistId: string | null;
}) {
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [playlistInput, setPlaylistInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const loadOverview = useCallback(async () => {
    setError(null);
    const result = await fetchOverviewData();
    setOverview(result.overview);
    setError(result.error);
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void fetchOverviewData().then((result) => {
      if (isCurrent) {
        setOverview(result.overview);
        setError(result.error);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function handlePlaylistInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInputError(null);
    setIsResolving(true);

    try {
      const response = await fetch("/api/spotify/playlists/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: playlistInput }),
      });

      if (!response.ok) {
        const nextError = await responseError(response);
        setInputError(nextError.message);
        return;
      }

      const body = (await response.json()) as { playlistId: string };
      router.push(`/playlist/${body.playlistId}`);
    } catch {
      setInputError("Bağlantı doğrulanamadı. Lütfen tekrar deneyin.");
    } finally {
      setIsResolving(false);
    }
  }

  if (!overview && !error) {
    return <DashboardSkeleton />;
  }

  if (error) {
    const isExpired = error.code === "unauthorized";

    return (
      <section className="mx-auto flex min-h-[65vh] max-w-xl items-center py-12 text-center">
        <div className="surface w-full rounded-[2rem] p-8 sm:p-12">
          <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-amber-400/15 text-2xl">!</span>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">
            {isExpired ? "Spotify bağlantısının süresi doldu" : "Çalma listeleri yüklenemedi"}
          </h1>
          <p className="mt-4 leading-7 text-[var(--muted)]">{error.message}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            {isExpired ? (
              <Link href="/api/auth/spotify/login" className="rounded-full bg-[var(--foreground)] px-6 py-3 font-bold text-[var(--background)]">
                Spotify&apos;ı yeniden bağla
              </Link>
            ) : (
              <button type="button" onClick={() => void loadOverview()} className="rounded-full bg-[var(--foreground)] px-6 py-3 font-bold text-[var(--background)]">
                Tekrar dene
              </button>
            )}
            <Link href="/" className="rounded-full border border-[var(--line)] px-6 py-3 font-bold">
              Ana sayfa
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!overview) {
    return null;
  }

  return (
    <div className="py-8 sm:py-12">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Artwork
            src={overview.user.imageUrl}
            alt={`${overview.user.displayName} profil görseli`}
            size={56}
            className="size-14 rounded-full"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]">
              <span className="size-2 rounded-full bg-[#1ed760]" />
              Spotify bağlı
            </p>
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {overview.user.displayName}
            </h1>
          </div>
        </div>
        <form action="/api/auth/spotify/logout" method="post">
          <button type="submit" className="rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-bold transition hover:bg-[var(--panel-strong)]">
            Bağlantıyı kes
          </button>
        </form>
      </section>

      <section className="surface mt-9 rounded-[2rem] p-5 sm:p-7">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Bağlantıyla seç</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Bir Spotify çalma listesi yapıştır</h2>
        </div>
        <form onSubmit={handlePlaylistInput} className="mt-5 flex flex-col gap-3 sm:flex-row" noValidate>
          <label htmlFor="playlist-input" className="sr-only">Spotify çalma listesi bağlantısı veya kimliği</label>
          <input
            id="playlist-input"
            name="playlist"
            value={playlistInput}
            onChange={(event) => setPlaylistInput(event.target.value)}
            placeholder="https://open.spotify.com/playlist/..."
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(inputError)}
            aria-describedby={inputError ? "playlist-input-error" : undefined}
            className="min-h-13 min-w-0 flex-1 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 text-sm outline-none placeholder:text-[var(--muted)]"
          />
          <button
            type="submit"
            disabled={isResolving || !playlistInput.trim()}
            className="min-h-13 rounded-2xl bg-[var(--foreground)] px-7 font-bold text-[var(--background)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isResolving ? "Kontrol ediliyor…" : "Listeyi aç"}
          </button>
        </form>
        {inputError && <p id="playlist-input-error" role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{inputError}</p>}
      </section>

      <section className="mt-12" aria-labelledby="playlists-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Hesabından seç</p>
            <h2 id="playlists-heading" className="mt-2 text-3xl font-semibold tracking-tight">Çalma listelerin</h2>
          </div>
          <span className="text-sm text-[var(--muted)]">{overview.playlists.length} liste</span>
        </div>

        {overview.playlists.length === 0 ? (
          <div className="surface mt-6 rounded-[2rem] px-6 py-16 text-center">
            <p className="text-xl font-semibold">Çalma listesi bulunamadı.</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Spotify&apos;da bir liste oluşturduktan sonra tekrar deneyebilirsin.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {overview.playlists.map((playlist) => (
              <article key={playlist.id} className={`surface group overflow-hidden rounded-[1.75rem] p-4 ${playlist.isReadableSource && playlist.id !== unavailablePlaylistId ? "" : "opacity-65"}`}>
                <a href={playlist.externalUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl" aria-label={`${playlist.name} çalma listesini Spotify'da aç`}>
                  <Artwork src={playlist.imageUrl} alt={`${playlist.name} kapak görseli`} size={600} className="aspect-square h-auto w-full rounded-2xl transition duration-300 group-hover:scale-[1.015]" />
                </a>
                <div className="px-1 pb-1 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold">{playlist.name}</h3>
                      <p className="mt-1 truncate text-sm text-[var(--muted)]">{playlist.ownerName}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-[var(--muted)]">
                      {playlist.public === true ? "Herkese açık" : playlist.public === false ? "Gizli" : "Spotify"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    {playlist.itemCount === null ? "Parça sayısı bilinmiyor" : `${playlist.itemCount} öğe`}
                    {playlist.collaborative ? " · Ortak liste" : ""}
                  </p>
                  {playlist.isReadableSource && playlist.id !== unavailablePlaylistId ? (
                    <Link href={`/playlist/${playlist.id}`} className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-[var(--foreground)] px-4 py-3 text-sm font-bold text-[var(--background)] transition hover:-translate-y-0.5">
                      Bu listeyi seç
                    </Link>
                  ) : (
                    <div className="mt-5 rounded-xl bg-amber-400/10 px-3 py-3 text-xs leading-5 text-[var(--muted)]" title={playlist.unavailableReason ?? undefined}>
                      {playlist.id === unavailablePlaylistId
                        ? "Spotify bu listenin parçalarına erişimi reddetti."
                        : "Bu liste şu anda kaynak olarak okunamıyor."}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
