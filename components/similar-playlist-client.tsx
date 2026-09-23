"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Artwork } from "@/components/artwork";
import type {
  GeneratedRecommendation,
  PlaylistLength,
  RecommendationGenerationResult,
} from "@/lib/recommendations/types";
import type { ConsensusStrictness } from "@/lib/recommendations/scoring/candidate-score";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

interface SaveResult {
  partial: boolean;
  playlist: { id: string; name: string; externalUrl: string };
  addedCount?: number;
  requestedCount?: number;
  error?: { message?: string };
}

const LENGTHS: PlaylistLength[] = [20, 30, 50, 100];

function friendlyLabel(label: GeneratedRecommendation["matchLabel"]): string {
  if (label === "Strong match") return "Güçlü eşleşme";
  if (label === "Discovery") return "Keşif";
  return "Benzer";
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as ApiErrorBody;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function SimilarPlaylistClient({ playlistId }: { playlistId: string }) {
  const [desiredCount, setDesiredCount] = useState<PlaylistLength>(30);
  const [strictness, setStrictness] = useState<ConsensusStrictness>("balanced");
  const [generationVariant, setGenerationVariant] = useState(0);
  const [result, setResult] = useState<RecommendationGenerationResult | null>(null);
  const [tracks, setTracks] = useState<GeneratedRecommendation[]>([]);
  const [playlistName, setPlaylistName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const initialRequestStarted = useRef(false);

  const generate = useCallback(async (count: PlaylistLength, variant: number, mode: ConsensusStrictness) => {
    setIsGenerating(true);
    setError(null);
    setSaveResult(null);
    try {
      const response = await fetch("/api/recommendations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId, desiredCount: count, generationVariant: variant, strictness: mode }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, "Benzer şarkılar bulunamadı."));
      }
      const body = await response.json() as RecommendationGenerationResult;
      setResult(body);
      setTracks(body.recommendations);
      setPlaylistName((current) => current || `${body.playlistName} — Similar`);
    } catch (caught) {
      setResult(null);
      setTracks([]);
      setError(caught instanceof Error ? caught.message : "Benzer şarkılar bulunamadı.");
    } finally {
      setIsGenerating(false);
    }
  }, [playlistId]);

  useEffect(() => {
    if (initialRequestStarted.current) return;
    initialRequestStarted.current = true;
    void generate(30, 0, "balanced");
  }, [generate]);

  function regenerate() {
    const nextVariant = generationVariant + 1;
    setGenerationVariant(nextVariant);
    void generate(desiredCount, nextVariant, strictness);
  }

  async function savePlaylist() {
    if (!result || tracks.length === 0 || isSaving) return;
    setIsSaving(true);
    setError(null);
    setSaveResult(null);
    try {
      const response = await fetch("/api/spotify/playlists/create-similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationToken: result.generationToken,
          selectedSpotifyIds: tracks.map((track) => track.spotifyId),
          name: playlistName,
          public: isPublic,
        }),
      });
      const body = await response.json() as SaveResult & ApiErrorBody;
      if (!response.ok && response.status !== 207) {
        throw new Error(body.error?.message ?? "Çalma listesi Spotify'a kaydedilemedi.");
      }
      setSaveResult(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Çalma listesi Spotify'a kaydedilemedi.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isGenerating) {
    return (
      <section className="mx-auto flex min-h-[65vh] max-w-xl items-center py-12 text-center" aria-live="polite" aria-busy="true">
        <div className="surface w-full rounded-[2rem] p-8 sm:p-12">
          <span aria-hidden="true" className="mx-auto grid size-16 animate-pulse place-items-center rounded-full bg-[var(--accent)] text-2xl text-[var(--accent-ink)]">≋</span>
          <h1 className="mt-7 text-3xl font-semibold tracking-tight">Çalma listen analiz ediliyor…</h1>
          <p className="mt-3 text-[var(--muted)]">Ses özellikleri, müzikal gruplar ve yeni şarkılar değerlendiriliyor.</p>
          <p className="mt-5 text-sm leading-7 text-[var(--muted)]">Liste okunuyor → ses özellikleri inceleniyor → müzikal gruplar bulunuyor → öneri kaynakları karşılaştırılıyor → yeni şarkılar seçiliyor</p>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="mx-auto flex min-h-[65vh] max-w-xl items-center py-12 text-center">
        <div className="surface w-full rounded-[2rem] p-8 sm:p-12">
          <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-amber-400/15 text-2xl">!</span>
          <h1 className="mt-6 text-3xl font-semibold">Öneriler hazırlanamadı</h1>
          <p className="mt-4 leading-7 text-[var(--muted)]">{error}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={() => void generate(desiredCount, generationVariant, strictness)} className="rounded-full bg-[var(--foreground)] px-6 py-3 font-bold text-[var(--background)]">Tekrar dene</button>
            <Link href={`/playlist/${encodeURIComponent(playlistId)}`} className="rounded-full border border-[var(--line)] px-6 py-3 font-bold">Kaynak listeye dön</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="py-8 sm:py-12">
      <Link href={`/playlist/${encodeURIComponent(playlistId)}`} className="inline-flex items-center gap-2 text-sm font-bold text-[var(--muted)] hover:text-[var(--foreground)]">← Kaynak liste</Link>
      <section className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Yeni keşif listesi</p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">“{result.playlistName}” listesine benzer</h1>
          <p className="mt-4 text-[var(--muted)]">{tracks.length} doğrulanmış Spotify parçası
            {result.analysis ? ` · Kaynak listede ${result.analysis.groupCount} müzikal grup bulundu` : ""}
          </p>
        </div>
        <button type="button" onClick={regenerate} className="min-h-12 rounded-full border border-[var(--line)] px-6 font-bold hover:bg-[var(--panel)]">Yeniden oluştur</button>
      </section>

      {result.analysis && (
        <div className="mt-6 flex flex-wrap gap-2" aria-label="Kaynak listenin müzikal grupları">
          {result.analysis.groups.map((group) => (
            <span key={group.id} className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]">
              {group.description} · %{group.percentage}
            </span>
          ))}
        </div>
      )}
      <section className="surface mt-8 flex flex-col gap-5 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
        <fieldset>
          <legend className="text-sm font-semibold">Liste uzunluğu</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {LENGTHS.map((length) => (
              <button
                key={length}
                type="button"
                aria-pressed={desiredCount === length}
                onClick={() => setDesiredCount(length)}
                className={`min-h-10 rounded-full px-4 text-sm font-bold ${desiredCount === length ? "bg-[var(--foreground)] text-[var(--background)]" : "border border-[var(--line)]"}`}
              >
                {length}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="text-sm font-semibold">
          Keşif düzeyi
          <select value={strictness} onChange={(event) => setStrictness(event.target.value as ConsensusStrictness)} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 text-[var(--foreground)]">
            <option value="strict">Yakın</option>
            <option value="balanced">Dengeli</option>
            <option value="exploratory">Keşif</option>
          </select>
        </label>
        <button type="button" onClick={regenerate} className="min-h-11 rounded-full bg-[var(--accent)] px-5 font-bold text-[var(--accent-ink)]">Bu uzunlukta oluştur</button>
      </section>

      {error && <p role="alert" className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm">{error}</p>}

      {tracks.length === 0 ? (
        <div className="surface mt-8 rounded-[2rem] px-6 py-16 text-center">
          <p className="text-xl font-semibold">Kaydedilecek parça kalmadı.</p>
          <button type="button" onClick={regenerate} className="mt-5 rounded-full border border-[var(--line)] px-5 py-2.5 font-bold">Yeniden oluştur</button>
        </div>
      ) : (
        <ol className="mt-8 space-y-2">
          {tracks.map((track, index) => (
            <li key={track.spotifyId} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-transparent p-2 transition hover:border-[var(--line)] hover:bg-[var(--panel)] sm:grid-cols-[2rem_3.5rem_minmax(0,1fr)_auto_auto] sm:gap-4 sm:px-4">
              <span className="hidden text-right text-sm tabular-nums text-[var(--muted)] sm:block">{index + 1}</span>
              <a href={track.externalUrl} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg">
                <Artwork src={track.imageUrl} alt={`${track.album} albüm kapağı`} size={56} className="size-12 rounded-lg sm:size-14" />
              </a>
              <div className="min-w-0">
                <a href={track.externalUrl} target="_blank" rel="noreferrer" className="block truncate font-semibold hover:underline">{track.name}</a>
                <p className="mt-1 truncate text-sm text-[var(--muted)]">{track.artists.join(", ")}</p>
                {track.explanation && <p className="mt-1 truncate text-xs text-[var(--muted)]">{track.explanation}</p>}
              </div>
              <span className="hidden rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--muted)] sm:inline-flex">{friendlyLabel(track.matchLabel)}</span>
              <button type="button" onClick={() => setTracks((current) => current.filter((item) => item.spotifyId !== track.spotifyId))} aria-label={`${track.name} parçasını kaldır`} className="grid size-10 place-items-center rounded-full text-xl text-[var(--muted)] hover:bg-red-400/10 hover:text-red-500">×</button>
            </li>
          ))}
        </ol>
      )}

      <section className="surface mt-10 rounded-[2rem] p-5 sm:p-8" aria-labelledby="save-heading">
        <h2 id="save-heading" className="text-2xl font-semibold">Spotify&apos;a kaydet</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="text-sm font-semibold">
            Çalma listesi adı
            <input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} maxLength={100} className="mt-2 min-h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 text-[var(--foreground)]" />
          </label>
          <label className="text-sm font-semibold">
            Görünürlük
            <select value={isPublic ? "public" : "private"} onChange={(event) => setIsPublic(event.target.value === "public")} className="mt-2 min-h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 text-[var(--foreground)]">
              <option value="private">Gizli</option>
              <option value="public">Herkese açık</option>
            </select>
          </label>
        </div>
        <button type="button" disabled={isSaving || saveResult !== null || tracks.length === 0 || playlistName.trim().length === 0} onClick={() => void savePlaylist()} className="mt-6 min-h-12 w-full rounded-full bg-[var(--foreground)] px-7 font-bold text-[var(--background)] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
          {isSaving ? "Spotify'a kaydediliyor…" : saveResult ? "Spotify'a kaydedildi" : "Spotify'a kaydet"}
        </button>

        {saveResult && (
          <div role="status" className={`mt-6 rounded-2xl p-5 ${saveResult.partial ? "bg-amber-400/10" : "bg-[var(--accent)]/10"}`}>
            <p className="text-lg font-semibold">{saveResult.partial ? "Liste oluşturuldu, bazı parçalar eklenemedi." : "Çalma listesi oluşturuldu!"}</p>
            {saveResult.partial && <p className="mt-2 text-sm text-[var(--muted)]">{saveResult.addedCount ?? 0}/{saveResult.requestedCount ?? tracks.length} parça eklendi. Boş ya da eksik listeyi Spotify&apos;dan düzenleyebilirsin.</p>}
            <a href={saveResult.playlist.externalUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full bg-[var(--foreground)] px-5 py-2.5 font-bold text-[var(--background)]">Spotify&apos;da aç</a>
          </div>
        )}
      </section>
    </div>
  );
}
