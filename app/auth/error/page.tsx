import Link from "next/link";

const messages: Record<string, string> = {
  access_denied: "Spotify bağlantısı iptal edildi. Hazır olduğunda tekrar deneyebilirsin.",
  invalid_state: "Güvenli bağlantı doğrulanamadı. Lütfen bağlantıyı yeniden başlat.",
  token_exchange_failed: "Spotify bağlantısı tamamlanamadı. Ayarları kontrol edip tekrar dene.",
  oauth_error: "Spotify bağlantısı sırasında bir sorun oluştu. Lütfen tekrar dene.",
};

interface AuthErrorPageProps {
  searchParams: Promise<{ code?: string }>;
}

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const { code } = await searchParams;
  const message = messages[code ?? ""] ?? messages.oauth_error;

  return (
    <section className="mx-auto flex min-h-[65vh] max-w-xl items-center py-16 text-center">
      <div className="surface w-full rounded-[2rem] p-8 sm:p-12">
        <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-amber-400/15 text-2xl">
          !
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Bağlantı tamamlanamadı</h1>
        <p className="mt-4 leading-7 text-[var(--muted)]">{message}</p>
        <Link
          href="/api/auth/spotify/login"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--foreground)] px-7 font-bold text-[var(--background)]"
        >
          Spotify&apos;ı tekrar bağla
        </Link>
      </div>
    </section>
  );
}
