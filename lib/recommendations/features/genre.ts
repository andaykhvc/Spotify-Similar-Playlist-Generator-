export function normalizeGenre(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return normalized || null;
}

export function genreFamily(value: string | null): string | null {
  const genre = normalizeGenre(value);
  if (!genre) return null;
  if (/^(synth pop|synthpop|electro pop|electropop|dance pop|pop)$/.test(genre)) return "pop";
  if (/^(electronic|electronica|edm|house|techno|trance|dance)$/.test(genre)) return "electronic";
  if (/^(hip hop|hiphop|rap|trap)$/.test(genre)) return "hip hop";
  if (/^(indie rock|alternative rock|rock|hard rock)$/.test(genre)) return "rock";
  if (/^(folk|acoustic|singer songwriter)$/.test(genre)) return "folk";
  return genre;
}

export function genreDistance(a: string | null, b: string | null): number | null {
  const left = normalizeGenre(a);
  const right = normalizeGenre(b);
  if (!left || !right) return null;
  if (left === right) return 0;
  return genreFamily(left) === genreFamily(right) ? 0.35 : 1;
}
