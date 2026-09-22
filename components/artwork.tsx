import Image from "next/image";

interface ArtworkProps {
  src: string | null;
  alt: string;
  size: number;
  className?: string;
}

export function Artwork({ src, alt, size, className = "" }: ArtworkProps) {
  if (!src) {
    return (
      <div
        aria-label={`${alt} için kapak görseli yok`}
        className={`grid shrink-0 place-items-center bg-gradient-to-br from-emerald-300/40 to-indigo-400/30 text-2xl text-[var(--muted)] ${className}`}
        style={{ width: size, height: size }}
      >
        ♪
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      sizes={`${size}px`}
      className={`shrink-0 bg-black/5 object-contain ${className}`}
    />
  );
}
