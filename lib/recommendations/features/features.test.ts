import { describe, expect, it } from "vitest";
import { featureDistance } from "@/lib/recommendations/features/distance";
import { genreDistance, genreFamily, normalizeGenre } from "@/lib/recommendations/features/genre";
import { camelotDistance, pitchClassDistance } from "@/lib/recommendations/features/harmonic";
import { fitProviderScales, normalizeProviderFeatures } from "@/lib/recommendations/features/normalization";
import { tempoDistance } from "@/lib/recommendations/features/tempo";
import { emptyFeatures } from "@/lib/recommendations/features/types";
import { parseFreqFeatures } from "@/lib/recommendations/providers/freqblog";
import { parseReccoFeatures } from "@/lib/recommendations/providers/reccobeats";

describe("independent audio feature views", () => {
  it("fits robust provider-specific scales and preserves missingness", () => {
    const reccoValues = [0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.9]
      .map((energy) => ({ ...emptyFeatures("recco"), energy }));
    const freqValues = [0.52, 0.54, 0.56, 0.58, 0.6, 0.62, 0.64, 0.98]
      .map((energy) => ({ ...emptyFeatures("freq"), energy }));
    const reccoScale = fitProviderScales(reccoValues);
    const freqScale = fitProviderScales(freqValues);
    expect(reccoScale.energy?.median).not.toBe(freqScale.energy?.median);
    const missing = normalizeProviderFeatures(emptyFeatures("recco"), reccoScale);
    expect(missing.normalized.energy).toBeUndefined();
    expect(missing.coverage).toBe(0);
  });

  it("ignores missing dimensions in distance and weights energy more than liveness", () => {
    const base = { ...emptyFeatures("recco"), energy: 0.5, liveness: 0.5 };
    const scales = fitProviderScales([base, { ...base, energy: 0.8, liveness: 0.8 }]);
    const view = normalizeProviderFeatures(base, scales);
    const energy = normalizeProviderFeatures({ ...base, energy: 0.8 }, scales);
    const liveness = normalizeProviderFeatures({ ...base, liveness: 0.8 }, scales);
    expect(featureDistance(view, energy, "reccobeats").value!)
      .toBeGreaterThan(featureDistance(view, liveness, "reccobeats").value!);
    const noShared = normalizeProviderFeatures({ ...emptyFeatures("recco"), tempo: 120 }, scales);
    expect(featureDistance(view, noShared, "reccobeats").value).toBeNull();
  });

  it("treats half and double tempo as nearby without rewriting source BPM", () => {
    expect(tempoDistance(64, 128)).toBeCloseTo(0, 6);
    expect(tempoDistance(64, 128, 65, null)).toBeCloseTo(0, 6);
    expect(tempoDistance(64, 97)!).toBeGreaterThan(0.3);
  });

  it("uses circular pitch classes and Camelot compatibility", () => {
    expect(pitchClassDistance(0, 11)).toBeCloseTo(1 / 6);
    expect(camelotDistance("8A", "8B")).toBeLessThan(camelotDistance("8A", "2B")!);
    expect(camelotDistance("12A", "1A")).toBe(0.25);
  });

  it("normalizes a few defensible genre families", () => {
    expect(normalizeGenre("Hip-Hop")).toBe("hip hop");
    expect(genreFamily("synthpop")).toBe("pop");
    expect(genreDistance("Hip-Hop", "hip hop")).toBe(0);
    expect(genreDistance("synthpop", "dance pop")).toBe(0.35);
  });

  it("parses only documented provider fields and leaves language unknown", () => {
    const recco = parseReccoFeatures({ id: "uuid", tempo: 128, energy: 0.8, key: 11, mode: 0 });
    const freq = parseFreqFeatures({ itunes_track_id: "42", bpm: 64, bpm_alt: 128,
      energy: 0.72, key_int: 0, camelot: "8A", mood: "happy", genre: "pop", feature_source: "essentia_preview" });
    expect(recco?.pitchClass).toBe(11);
    expect(recco?.camelot).toBeNull();
    expect(freq?.tempoAlternative).toBe(128);
    expect(freq?.genre).toBe("pop");
    expect(recco?.language).toBeNull();
    expect(freq?.language).toBeNull();
  });
});
