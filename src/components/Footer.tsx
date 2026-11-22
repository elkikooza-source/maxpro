import { Link } from 'react-router-dom';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { BrandLockup } from './BrandLockup';

export function Footer() {
  const { lang, toggleLang, t, settings } = useStore();
  const locationLabel = lang === 'ar' ? settings.contact_location_ar : settings.contact_location_fr;
  const whatsappClean = (settings.contact_whatsapp || '21652088950').replace(/[^\d]/g, '');

  return (
    <footer className="border-t border-white/[0.07] bg-black mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-white/[0.06]">
          <div className="md:col-span-5 space-y-4">
            <BrandLockup size="lg" />
            <p className="text-sm text-zinc-400 max-w-sm leading-relaxed">
              {lang === 'ar'
                ? 'تجهيزات وإكسسوارات سيارات فاخرة مصممة بعناية لتمنح مقصورتك أناقة وحماية استثنائية.'
                : 'Équipements et accessoires automobiles de luxe pensés pour sublimer et préserver votre habitacle.'}
            </p>
          </div>

          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {t.footer.navigation}
            </h4>
            <ul className="space-y-2.5 text-sm text-zinc-300">
              <li>
                <Link to="/" className="hover:text-white transition-colors">
                  {t.nav.home}
                </Link>
              </li>
              <li>
                <Link to="/shop" className="hover:text-white transition-colors">
                  {t.nav.shop}
                </Link>
              </li>
              <li>
                <Link to="/shop?bestseller=true" className="hover:text-white transition-colors">
                  {t.shop.onlyBestsellers}
                </Link>
              </li>
              <li>
                <Link to="/shop?new=true" className="hover:text-white transition-colors">
                  {t.shop.onlyNew}
                </Link>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {t.footer.contact}
            </h4>
            <ul className="space-y-2.5 text-sm text-zinc-300">
              <li className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>{locationLabel}</span>
              </li>
              <li>
                <a
                  href={`mailto:${settings.contact_email}`}
                  className="flex items-center gap-2.5 hover:text-white transition-colors"
                >
                  <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span dir="ltr">{settings.contact_email}</span>
                </a>
              </li>
              <li>
                <a
                  href={`tel:${settings.contact_phone.replace(/\s+/g, '')}`}
                  className="flex items-center gap-2.5 hover:text-white transition-colors"
                >
                  <Phone className="w-4 h-4 text-zinc-400 shrink-0" />
                  <span dir="ltr">{settings.contact_phone}</span>
                </a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${whatsappClean}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-white hover:text-zinc-300 transition-colors pt-1"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span>{t.home.whatsappCta}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-7 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>
            © {new Date().getFullYear()} {settings.brand_name} — {t.footer.rights}
          </p>

          <button
            type="button"
            onClick={toggleLang}
            className="min-h-[36px] px-3.5 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            {lang === 'fr' ? 'Passer en عربي' : 'Passer en Français (FR)'}
          </button>
        </div>
      </div>
    </footer>
  );
}
