import Link from "next/link";
import { getSpotifySession } from "@/lib/session";

export default async function HomePage() {
  const isConnected = Boolean(await getSpotifySession());

  return (
    <section className="relative flex min-h-[calc(100vh-10rem)] items-center py-16 sm:py-24">
      <div className="grid w-full gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="max-w-3xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            <span className="size-2 rounded-full bg-[#1ed760]" />
            Çalma listenden başla
          </p>
          <h1 className="text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-7xl lg:text-8xl">
            Benzer bir çalma listesi oluştur.
          </h1>
          <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-[var(--muted)] sm:text-xl">
            Spotify&apos;ı bağla, çalma listelerinden birini seç ve benzer
            müziklerden oluşan yeni bir liste hazırlamaya başla.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              href={isConnected ? "/dashboard" : "/api/auth/spotify/login"}
              className="inline-flex min-h-14 items-center justify-center rounded-full bg-[var(--foreground)] px-8 text-base font-bold text-[var(--background)] transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              {isConnected ? "Çalma listelerime git" : "Spotify'ı bağla"}
              <span aria-hidden="true" className="ml-3">→</span>
            </Link>
            <span className="inline-flex min-h-14 items-center justify-center px-5 text-sm text-[var(--muted)]">
              Şifreni hiçbir zaman görmeyiz.
            </span>
          </div>
        </div>

        <div className="surface relative mx-auto w-full max-w-lg overflow-hidden rounded-[2rem] p-5 sm:p-7">
          <div className="absolute -right-16 -top-20 size-56 rounded-full bg-[#1ed760]/20 blur-3xl" />
          <div className="relative space-y-3">
            <div className="mb-8 flex items-center justify-between">
              <p className="text-sm font-semibold">Akış</p>
              <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)]">
                Tam akış
              </span>
            </div>
            {[
              ["01", "Spotify hesabını bağla"],
              ["02", "Kaynak çalma listesini seç"],
              ["03", "Parçaları gözden geçir"],
              ["04", "Benzer listeyi oluştur", "Hazır"],
            ].map(([number, label, status]) => (
              <div
                key={number}
                className="flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-4"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--background)] text-xs font-bold text-[var(--muted)]">
                  {number}
                </span>
                <span className="flex-1 text-sm font-semibold">{label}</span>
                {status && (
                  <span className="text-xs font-semibold text-[var(--muted)]">{status}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
