import { useEffect, useRef, useState } from 'react';

interface SafeImageProps {
  src?: string;
  alt: string;
  className?: string;
  eager?: boolean;
}

export function SafeImage({ src, alt, className = '', eager = false }: SafeImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setFailed(false);
    setLoaded(Boolean(imgRef.current?.complete && imgRef.current?.naturalWidth > 0));
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-[#0d0f14] to-zinc-950 text-zinc-500 select-none ${className}`}
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
        <span className="text-[11px] tracking-widest uppercase text-zinc-600 font-medium px-4 text-center line-clamp-1">
          maxPro
        </span>
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : 'low'}
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={`${className} bg-[#0c0e13] transition-opacity duration-150 ${loaded ? 'opacity-100' : 'opacity-50'}`}
    />
  );
}
