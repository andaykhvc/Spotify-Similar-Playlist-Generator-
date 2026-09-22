import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SpotifyAttribution } from "@/components/spotify-attribution";

export const metadata: Metadata = {
  title: {
    default: "EchoList — Benzer Çalma Listesi Oluştur",
    template: "%s — EchoList",
  },
  description:
    "Spotify çalma listenizi seçin ve benzer müziklerden yeni bir liste oluşturmaya hazırlanın.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
          <header className="flex h-20 items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-3 rounded-full text-base font-semibold tracking-tight"
            >
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-full bg-[var(--foreground)] text-[var(--background)]"
              >
                ≋
              </span>
              EchoList
            </Link>
            <SpotifyAttribution compact />
          </header>
          <main className="flex-1">{children}</main>
          <footer className="flex flex-col gap-3 border-t border-[var(--line)] py-8 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
            <p>Spotify ile çalışan bağımsız bir müzik aracı.</p>
            <div className="flex items-center gap-5">
              <Link href="/privacy" className="font-semibold hover:text-[var(--foreground)]">Gizlilik</Link>
              <SpotifyAttribution />
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
