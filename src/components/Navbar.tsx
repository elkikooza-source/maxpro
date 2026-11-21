import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, ShoppingBag, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { BrandLockup } from './BrandLockup';

export function Navbar() {
  const { lang, toggleLang, t, settings, cartCount, setCartOpen } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [promoDismissed, setPromoDismissed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const promoText = lang === 'ar' ? settings.promo_text_ar : settings.promo_text_fr;
  const showPromo = settings.promo_enabled && !promoDismissed && Boolean(promoText);

  const handleAnchorLink = (hash: string) => {
    setMobileMenuOpen(false);
    if (location.pathname !== '/') {
      navigate('/');
      setTimeout(() => {
        const el = document.getElementById(hash);
        el?.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    } else {
      const el = document.getElementById(hash);
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed top-0 inset-x-0 z-40 pointer-events-none">
      {showPromo && (
        <div className="pointer-events-auto h-8 bg-zinc-950/95 border-b border-white/10 backdrop-blur-md px-3 flex items-center justify-center relative">
          <p className="text-[11px] sm:text-xs text-zinc-300 truncate max-w-[85%] text-center">
            {promoText}
          </p>
          <button
            type="button"
            onClick={() => setPromoDismissed(true)}
            aria-label="Fermer"
            className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-2.5 sm:pt-3.5">
        <header className="pointer-events-auto glass-nav rounded-2xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4 sm:gap-8">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded-md shrink-0"
          >
            <BrandLockup size="sm" />
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-300">
            <Link
              to="/"
              className={`whitespace-nowrap shrink-0 py-1 border-b transition-colors duration-150 ${
                location.pathname === '/'
                  ? 'text-white border-white/60'
                  : 'border-transparent hover:text-white hover:border-white/30'
              }`}
            >
              {t.nav.home}
            </Link>
            <Link
              to="/shop"
              className={`whitespace-nowrap shrink-0 py-1 border-b transition-colors duration-150 ${
                location.pathname.startsWith('/shop')
                  ? 'text-white border-white/60'
                  : 'border-transparent hover:text-white hover:border-white/30'
              }`}
            >
              {t.nav.shop}
            </Link>
            <button
              type="button"
              onClick={() => handleAnchorLink('categories')}
              className="whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:text-white hover:border-white/30 transition-colors duration-150 cursor-pointer"
            >
              {t.nav.categories}
            </button>
            <button
              type="button"
              onClick={() => handleAnchorLink('contact')}
              className="whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:text-white hover:border-white/30 transition-colors duration-150 cursor-pointer"
            >
              {t.nav.contact}
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleLang}
              className="min-h-[40px] px-3 rounded-xl text-xs font-semibold tracking-wide text-zinc-200 hover:text-white bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Changer de langue"
            >
              {lang === 'fr' ? 'عربي' : 'FR'}
            </button>

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="min-h-[40px] px-3.5 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 transition-colors inline-flex items-center gap-2 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              aria-label={t.nav.cart}
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{t.nav.cart}</span>
              <span className="tabular-nums font-bold">({cartCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="md:hidden min-h-[44px] min-w-[44px] rounded-xl bg-white/[0.04] border border-white/10 text-zinc-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              aria-label={t.nav.menu}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="pointer-events-auto md:hidden mt-2 glass-nav rounded-2xl p-4 flex flex-col gap-1">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-[44px] px-3 rounded-xl flex items-center text-sm font-medium text-zinc-100 hover:bg-white/[0.06] transition-colors"
            >
              {t.nav.home}
            </Link>
            <Link
              to="/shop"
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-[44px] px-3 rounded-xl flex items-center text-sm font-medium text-zinc-100 hover:bg-white/[0.06] transition-colors"
            >
              {t.nav.shop}
            </Link>
            <button
              type="button"
              onClick={() => handleAnchorLink('categories')}
              className="min-h-[44px] px-3 rounded-xl flex items-center text-sm font-medium text-zinc-100 hover:bg-white/[0.06] transition-colors text-start"
            >
              {t.nav.categories}
            </button>
            <button
              type="button"
              onClick={() => handleAnchorLink('contact')}
              className="min-h-[44px] px-3 rounded-xl flex items-center text-sm font-medium text-zinc-100 hover:bg-white/[0.06] transition-colors text-start"
            >
              {t.nav.contact}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
