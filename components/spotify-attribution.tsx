export function SpotifyAttribution({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="https://open.spotify.com/"
      target="_blank"
      rel="noreferrer"
      aria-label="Spotify'ı aç"
      className="inline-flex items-center gap-2 rounded-full text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5 shrink-0"
      >
        <circle cx="12" cy="12" r="12" fill="#1ED760" />
        <path
          d="M6.6 8.7c3.65-1.06 7.83-.82 10.96.67"
          fill="none"
          stroke="#0b2113"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
        <path
          d="M7.25 12c3.07-.82 6.65-.59 9.3.66"
          fill="none"
          stroke="#0b2113"
          strokeLinecap="round"
          strokeWidth="1.55"
        />
        <path
          d="M7.85 15.1c2.63-.62 5.43-.4 7.75.62"
          fill="none"
          stroke="#0b2113"
          strokeLinecap="round"
          strokeWidth="1.4"
        />
      </svg>
      {!compact && <span>Spotify&apos;da aç</span>}
    </a>
  );
}
