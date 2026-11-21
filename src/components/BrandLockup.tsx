import { useState } from 'react';
import { useStore } from '../context/StoreContext';

interface BrandLockupProps {
  size?: 'sm' | 'md' | 'lg';
}

export function BrandLockup({ size = 'md' }: BrandLockupProps) {
  const { settings } = useStore();
  const [logoError, setLogoError] = useState(false);

  if (settings.logo_url && !logoError) {
    return (
      <div dir="ltr" className="inline-flex items-center shrink-0">
        <img
          src={settings.logo_url}
          alt={settings.brand_name || 'maxPro'}
          referrerPolicy="no-referrer"
          onError={() => setLogoError(true)}
          className={
            size === 'lg'
              ? 'h-10 w-auto object-contain'
              : size === 'sm'
              ? 'h-7 w-auto object-contain'
              : 'h-8 w-auto object-contain'
          }
        />
      </div>
    );
  }

  const titleClass =
    size === 'lg'
      ? 'text-2xl sm:text-3xl font-semibold tracking-tight'
      : size === 'sm'
      ? 'text-lg font-semibold tracking-tight'
      : 'text-xl font-semibold tracking-tight';

  const taglineClass =
    size === 'lg'
      ? 'text-[10px] tracking-[0.34em]'
      : 'text-[9px] tracking-[0.3em]';

  return (
    <div dir="ltr" className="inline-flex flex-col leading-none select-none shrink-0 text-left">
      <span className={`font-display text-white whitespace-nowrap ${titleClass}`}>
        {settings.brand_name || 'maxPro'}
      </span>
      <span
        className={`uppercase text-zinc-400 font-medium whitespace-nowrap mt-0.5 ${taglineClass}`}
      >
        {settings.brand_tagline || 'accessoires auto'}
      </span>
    </div>
  );
}
