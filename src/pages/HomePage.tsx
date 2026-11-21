import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';
import { SafeImage } from '../components/SafeImage';

export default function HomePage() {
  const { lang, t, settings, categories, products, loading } = useStore();

  const heroTitle = lang === 'ar' ? settings.hero_title_ar : settings.hero_title_fr;
  const heroSubtitle = lang === 'ar' ? settings.hero_subtitle_ar : settings.hero_subtitle_fr;
  const locationLabel = lang === 'ar' ? settings.contact_location_ar : settings.contact_location_fr;
  const whatsappClean = (settings.contact_whatsapp || '21652088950').replace(/[^\d]/g, '');

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.slug, c])), [categories]);

  const featuredProducts = useMemo(() => {
    const idOrder = settings.featured_product_ids || [];
    const byId = new Map(products.map((p) => [p.id, p]));
    const picked = idOrder.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    if (picked.length >= 3) return picked.slice(0, 4);

    const flagged = products.filter((p) => p.is_featured && !picked.some((x) => x.id === p.id));
    const combined = [...picked, ...flagged];
    if (combined.length >= 4) return combined.slice(0, 4);

    const extras = products.filter((p) => !combined.some((x) => x.id === p.id));
    return [...combined, ...extras].slice(0, 4);
  }, [products, settings.featured_product_ids]);

  const scrollToCategories = () => {
    const el = document.getElementById('categories');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen">
      {/* Cinematic Dark Automotive Cabin Hero */}
      <section className="relative min-h-[92vh] sm:min-h-screen flex items-end pb-16 sm:pb-24 pt-28 overflow-hidden">
        <div className="absolute inset-0">
          <SafeImage
            src={settings.hero_image}
            alt={settings.brand_name}
            eager
            className="w-full h-full object-cover object-center scale-[1.02]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060709] via-[#060709]/55 to-[#060709]/35" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#060709]/80 via-[#060709]/25 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-2xl space-y-5"
          >
            <p className="text-xs sm:text-sm tracking-[0.28em] uppercase text-zinc-300 font-medium">
              {settings.brand_name} · {t.hero.scrollHint}
            </p>

            <h1 className="font-display text-4xl sm:text-6xl font-semibold tracking-tight text-white leading-[1.05] text-balance">
              {heroTitle}
            </h1>

            <p className="text-lg sm:text-2xl text-zinc-300 font-light text-balance">
              {heroSubtitle}
            </p>

            <div className="pt-3 flex flex-wrap items-center gap-3.5">
              <Link
                to="/shop"
                className="min-h-[48px] px-6 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 transition-colors inline-flex items-center gap-2 text-sm font-semibold whitespace-nowrap shrink-0"
              >
                <span>{t.hero.ctaExplore}</span>
                <ArrowRight className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
              </Link>

              <button
                type="button"
                onClick={scrollToCategories}
                className="min-h-[48px] px-6 rounded-xl glass-panel text-white hover:bg-white/[0.1] transition-colors inline-flex items-center text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.hero.ctaDiscover}
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Editorial Categories Grid */}
      <section id="categories" className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 sm:mb-12">
          <div className="space-y-2 max-w-xl">
            <p className="text-xs tracking-[0.22em] uppercase text-zinc-400">
              {t.home.categoriesEyebrow}
            </p>
            <h2 className="font-display text-2xl sm:text-4xl font-semibold text-white tracking-tight text-balance">
              {t.home.categoriesTitle}
            </h2>
          </div>
          <p className="text-sm text-zinc-400 max-w-md">{t.home.categoriesSubtitle}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {categories.map((cat) => {
            const name = lang === 'ar' ? cat.name_ar : cat.name_fr;
            const desc = lang === 'ar' ? cat.description_ar : cat.description_fr;
            return (
              <Link
                key={cat.id}
                to={`/shop?category=${encodeURIComponent(cat.slug)}`}
                className="group relative rounded-2xl overflow-hidden glass-surface aspect-[4/3] block"
              >
                <SafeImage
                  src={cat.image_url}
                  alt={name}
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-white tracking-tight truncate">
                      {name}
                    </h3>
                    <p className="text-xs text-zinc-300 mt-1 line-clamp-2">{desc}</p>
                  </div>
                  <span className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 backdrop-blur-md flex items-center justify-center text-white shrink-0 group-hover:bg-white group-hover:text-zinc-950 transition-colors">
                    <ArrowRight className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Featured Products Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 border-t border-white/[0.07]">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10 sm:mb-12">
          <div className="space-y-2">
            <p className="text-xs tracking-[0.22em] uppercase text-zinc-400">
              {t.home.featuredEyebrow}
            </p>
            <h2 className="font-display text-2xl sm:text-4xl font-semibold text-white tracking-tight">
              {t.home.featuredTitle}
            </h2>
          </div>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <span>{t.home.featuredCta}</span>
            <ArrowRight className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
          </Link>
        </div>

        {loading && featuredProducts.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl glass-surface h-80 animate-pulse bg-white/[0.03]"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                category={categoryMap.get(product.category_slug)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Craftsmanship & Hammam Lif Showroom Block */}
      <section id="contact" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="glass-panel rounded-3xl p-6 sm:p-12 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
            <div className="space-y-4">
              <p className="text-xs tracking-[0.22em] uppercase text-zinc-400">
                {t.home.craftEyebrow}
              </p>
              <h2 className="font-display text-2xl sm:text-4xl font-semibold text-white tracking-tight text-balance">
                {t.home.craftTitle}
              </h2>
              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-2xl">
                {t.home.craftBody}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-white/[0.08]">
              <div>
                <h3 className="text-sm font-semibold text-white">{t.home.craftPoint1Title}</h3>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  {t.home.craftPoint1Desc}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{t.home.craftPoint2Title}</h3>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  {t.home.craftPoint2Desc}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{t.home.craftPoint3Title}</h3>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  {t.home.craftPoint3Desc}
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-[#0a0c10]/85 border border-white/[0.08] p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-2">
              <h3 className="font-display text-xl font-semibold text-white">
                {t.home.contactTitle}
              </h3>
              <p className="text-sm text-zinc-400">{t.home.contactSubtitle}</p>
            </div>

            <div className="space-y-4 text-sm text-zinc-200">
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>{locationLabel}</span>
              </div>
              <a
                href={`tel:${settings.contact_phone.replace(/\s+/g, '')}`}
                className="flex items-center gap-3 hover:text-white transition-colors"
              >
                <Phone className="w-4 h-4 text-zinc-400 shrink-0" />
                <span dir="ltr">{settings.contact_phone}</span>
              </a>
              <a
                href={`mailto:${settings.contact_email}`}
                className="flex items-center gap-3 hover:text-white transition-colors"
              >
                <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
                <span dir="ltr" className="truncate">
                  {settings.contact_email}
                </span>
              </a>
            </div>

            <a
              href={`https://wa.me/${whatsappClean}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[48px] px-5 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 transition-colors inline-flex items-center justify-center gap-2 text-sm font-semibold"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{t.home.whatsappCta}</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
