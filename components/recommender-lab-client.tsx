"use client";

import { useState } from "react";
import type { GenerationDiagnostics } from "@/lib/recommendations";
import type { GeneratedRecommendation, PlaylistLength } from "@/lib/recommendations/types";
import type { ConsensusStrictness } from "@/lib/recommendations/scoring/candidate-score";
import { DEFAULT_CONSENSUS_STRICTNESS } from "@/lib/recommendations/recommendation-config";

interface LabResponse {
  diagnostics: GenerationDiagnostics;
  recommendations: GeneratedRecommendation[];
}

function value(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export function RecommenderLabClient() {
  const [playlistId, setPlaylistId] = useState("");
  const [length, setLength] = useState<PlaylistLength>(30);
  const [strictness, setStrictness] = useState<ConsensusStrictness>(DEFAULT_CONSENSUS_STRICTNESS);
  const [response, setResponse] = useState<LabResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setBusy(true); setError(null); setResponse(null);
    try {
      const request = await fetch("/api/dev/recommender-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId, desiredCount: length, strictness, generationVariant: 0 }),
      });
      const body = await request.json();
      if (!request.ok) throw new Error(body.error?.message ?? body.error ?? "Analysis failed");
      setResponse(body as LabResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed");
    } finally { setBusy(false); }
  }

  const data = response?.diagnostics;
  return (
    <div className="py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">Development only</p>
      <h1 className="mt-3 text-4xl font-semibold">Recommender lab</h1>
      <p className="mt-2 text-[var(--muted)]">Müzikal grupları, kapsama oranlarını ve aday puanlarını incele.</p>
      <div className="surface mt-8 flex flex-wrap items-end gap-3 rounded-2xl p-5">
        <label className="min-w-64 flex-1 text-sm font-semibold">Spotify playlist ID
          <input value={playlistId} onChange={(event) => setPlaylistId(event.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3" />
        </label>
        <label className="text-sm font-semibold">Uzunluk
          <select value={length} onChange={(event) => setLength(Number(event.target.value) as PlaylistLength)} className="mt-2 block min-h-11 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3">
            {[20, 30, 50, 100].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Mod
          <select value={strictness} onChange={(event) => setStrictness(event.target.value as ConsensusStrictness)} className="mt-2 block min-h-11 rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3">
            <option value="strict">Strict</option><option value="balanced">Balanced</option><option value="exploratory">Exploratory</option>
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => void analyze()} className="min-h-11 rounded-full bg-[var(--foreground)] px-5 font-bold text-[var(--background)] disabled:opacity-50">{busy ? "Analyzing…" : "Analyze"}</button>
      </div>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-400/10 p-4">{error}</p>}
      {data && <>
        <section className="surface mt-8 rounded-2xl p-5">
          <h2 className="text-2xl font-semibold">Özet · {data.engineVersion}</h2>
          <p className="mt-3 text-sm text-[var(--muted)]">{data.sourceTrackCount} kaynak · {data.profile.clusters.length} grup · {data.candidateCount} aday · {data.resolvedCount} Spotify eşleşmesi · {response.recommendations.length} seçilen</p>
          <p className="mt-2 text-sm text-[var(--muted)]">Kapsama: iki sağlayıcı %{value(data.providerCoverage.dual * 100, 0)}, Recco %{value(data.providerCoverage.reccoOnly * 100, 0)}, FreqBlog %{value(data.providerCoverage.freqOnly * 100, 0)}, çözülemeyen %{value(data.providerCoverage.unresolved * 100, 0)}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">Silhouette: Recco {value(data.profile.metrics.reccoSilhouette)} · Freq {value(data.profile.metrics.freqSilhouette)} · consensus {value(data.profile.metrics.consensusSilhouette)} · ARI {value(data.profile.metrics.adjustedRandIndex)}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">Sonuç: {data.resultMetrics.distinctArtists} sanatçı · kaynak tekrarı {data.resultMetrics.sourceDuplication} · sağlayıcı anlaşması %{value(data.resultMetrics.providerAgreementShare * 100, 0)} · ret %{value(data.resultMetrics.rejectionRate * 100, 0)}</p>
        </section>
        <section className="mt-10">
          <h2 className="text-2xl font-semibold">Consensus grupları</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.profile.clusters.map((cluster) => <div key={cluster.id} className="surface rounded-2xl p-5">
              <h3 className="font-semibold">{cluster.description}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{cluster.memberIndices.length} parça · %{value(cluster.weight * 100, 0)} · güven {value(cluster.providerAgreement)} · kapsama {value(cluster.featureCoverage)}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">BPM {value(cluster.medianTempo, 0)} · enerji {value(cluster.medianEnergy)} · dans {value(cluster.medianDanceability)} · valence {value(cluster.medianValence)} · loudness {value(cluster.medianLoudness)}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">Medoid: {cluster.medoidIndices.slice(0, 3).map((index) => data.profile.records[index].identity.name).join(", ")}</p>
            </div>)}
          </div>
        </section>
        <section className="mt-10">
          <h2 className="text-2xl font-semibold">Kaynak parçalar</h2>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs">
            <thead><tr className="border-b border-[var(--line)]"><th>Parça</th><th>Sanatçı</th><th>Recco</th><th>Freq</th><th>Eksik</th><th>R grubu</th><th>F grubu</th><th>Consensus</th><th>Güven</th></tr></thead>
            <tbody>{data.profile.records.map((record, index) => {
              const assignment = data.profile.assignments[index];
              return <tr key={record.identity.spotifyId} className="border-b border-[var(--line)] align-top">
                <td className="py-2 pr-3">{record.identity.name}</td><td>{record.identity.artists.join(", ")}</td>
                <td>{record.reccobeats ? `E ${value(record.reccobeats.raw.energy)} · BPM ${value(record.reccobeats.raw.tempo, 0)}` : "—"}</td>
                <td>{record.freqblog ? `E ${value(record.freqblog.raw.energy)} · BPM ${value(record.freqblog.raw.tempo, 0)}` : "—"}</td>
                <td>{assignment.coverage}</td><td>{assignment.reccoCluster ?? "—"}</td><td>{assignment.freqCluster ?? "—"}</td>
                <td>{assignment.consensusCluster ?? "—"}</td><td>{value(assignment.confidence)}</td>
              </tr>;
            })}</tbody>
          </table></div>
        </section>
        <section className="mt-10">
          <h2 className="text-2xl font-semibold">Aday değerlendirmesi</h2>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs">
            <thead><tr className="border-b border-[var(--line)]"><th>Parça</th><th>Grup</th><th>Kaynak</th><th>Recco uzaklığı</th><th>Freq uzaklığı</th><th>Uyum</th><th>Tür</th><th>Tempo / Harmoni</th><th>Puan</th><th>Durum</th></tr></thead>
            <tbody>{data.candidateEvaluations.map((item) => <tr key={item.track.spotifyId} className="border-b border-[var(--line)] align-top">
              <td className="py-2 pr-3">{item.track.name} · {item.track.artists[0]}</td><td>{item.clusterId}</td>
              <td>{item.candidate.generatedBy.join("+")}</td><td>{value(item.reccoDistance)} / {value(item.reccoRadiusRatio)}</td>
              <td>{value(item.freqDistance)} / {value(item.freqRadiusRatio)}</td><td>{value(item.components.clusterFit)}</td>
              <td>{value(item.components.genreFit)}</td><td>{item.reasons.join(", ") || "—"}</td>
              <td>{value(item.score)}</td><td>{item.accepted ? "accepted" : item.rejectionReason}</td>
            </tr>)}</tbody>
          </table></div>
        </section>
      </>}
    </div>
  );
}
