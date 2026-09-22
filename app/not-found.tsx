import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[65vh] max-w-lg flex-col items-center justify-center text-center">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--muted)]">404</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">Bu sayfa bulunamadı</h1>
      <Link href="/" className="mt-8 rounded-full bg-[var(--foreground)] px-6 py-3 font-bold text-[var(--background)]">
        Ana sayfaya dön
      </Link>
    </div>
  );
}
