import { useEffect, useRef, useState } from 'react';

interface SafeImageProps {
  src?: string;
  alt: string;
  className?: string;
  eager?: boolean;
}

function getSafeImageUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) {
    return trimmed.startsWith('//') ? null : trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? trimmed : null;
  } catch {
    return null;
  }
}

export function SafeImage({ src, alt, className = '', eager = false }: SafeImageProps) {
  const safeSrc = getSafeImageUrl(src);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setFailed(false);
    setLoaded(Boolean(imgRef.current?.complete && imgRef.current?.naturalWidth > 0));
  }, [safeSrc]);

  if (!safeSrc || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-zinc-500 select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          className="text-zinc-600 mb-2"
          aria-hidden="true"
        >
          <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.5l2.3-3.1A2 2 0 0 1 8.4 3h7.2a2 2 0 0 1 1.6.9L19.5 7H21a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" />
          <circle cx="7.5" cy="17" r="2.5" />
          <circle cx="16.5" cy="17" r="2.5" />
        </svg>
        <span className="text-[11px] tracking-widest uppercase text-zinc-500 font-medium px-4 text-center line-clamp-1">
          maxPro
        </span>
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={safeSrc}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : 'low'}
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={`${className} bg-zinc-900 transition-opacity duration-150 ${loaded ? 'opacity-100' : 'opacity-65'}`}
    />
  );
}
