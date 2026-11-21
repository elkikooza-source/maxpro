import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Minus, Plus, ShieldCheck, ShoppingBag } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatTnd } from '../i18n/translations';
import type { Product, ProductVariation } from '../types/store';
import { ProductCard } from '../components/ProductCard';
import { SafeImage } from '../components/SafeImage';

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { lang, t, categories, addToCart } = useStore();

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setActiveImage(0);
    setQuantity(1);

    fetch(`/api/products/${encodeURIComponent(slug || '')}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        if (data?.product) {
          setProduct(data.product);
          setSelectedVariation(data.product.variations?.[0] || null);
          setRelated(Array.isArray(data.related) ? data.related : []);
        } else {
          setProduct(null);
        }
      })
      .catch(() => {
        if (active) setProduct(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen pt-36 pb-20 max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 aspect-[4/3] rounded-2xl bg-white/[0.04] animate-pulse" />
          <div className="lg:col-span-5 h-96 rounded-2xl bg-white/[0.04] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen pt-40 pb-20 max-w-2xl mx-auto px-4 text-center space-y-5">
        <h1 className="font-display text-2xl font-semibold text-white">{t.product.notFound}</h1>
        <Link
          to="/shop"
          className="min-h-[44px] px-6 rounded-xl bg-white text-zinc-950 text-sm font-semibold inline-flex items-center"
        >
          {t.product.backToShop}
        </Link>
      </div>
    );
  }

  const category = categories.find((c) => c.slug === product.category_slug);
  const name = lang === 'ar' ? product.name_ar : product.name_fr;
  const shortDesc = lang === 'ar' ? product.short_desc_ar : product.short_desc_fr;
  const fullDesc = lang === 'ar' ? product.description_ar : product.description_fr;
  const catName = category ? (lang === 'ar' ? category.name_ar : category.name_fr) : '';

  const hasPromo = product.sale_price !== null && product.sale_price < product.price;
  const basePrice = hasPromo ? product.sale_price! : product.price;
  const finalPrice = Number((basePrice + (selectedVariation?.price_delta || 0)).toFixed(2));
  const originalWithDelta = Number((product.price + (selectedVariation?.price_delta || 0)).toFixed(2));

  const handleAdd = () => {
    addToCart(product, selectedVariation, quantity, true);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1800);
  };

  const handleBuyNow = () => {
    addToCart(product, selectedVariation, quantity, false);
    navigate('/checkout');
  };

  return (
    <div className="min-h-screen pt-32 sm:pt-36 pb-28 sm:pb-20 max-w-7xl mx-auto px-4 sm:px-6">
      <div className="mb-8">
        <Link
          to="/shop"
          className="inline-flex items-center gap-2 text-xs sm:text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
          <span>{t.product.backToShop}</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Interactive Image Gallery */}
        <div className="lg:col-span-7 space-y-4 lg:sticky lg:top-28">
          <div className="aspect-[4/3] rounded-2xl overflow-hidden glass-surface bg-[#0c0e13]">
            <SafeImage
              src={product.images[activeImage] || product.images[0]}
              alt={name}
              eager
              className="w-full h-full object-cover"
            />
          </div>

          {product.images.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
              {product.images.map((img, idx) => (
                <button
                  key={`${img}-${idx}`}
                  type="button"
                  onClick={() => setActiveImage(idx)}
                  className={`w-24 aspect-[4/3] rounded-xl overflow-hidden border transition-all shrink-0 cursor-pointer ${
                    activeImage === idx
                      ? 'border-white opacity-100'
                      : 'border-white/10 opacity-60 hover:opacity-90'
                  }`}
                >
                  <SafeImage src={img} alt={`${name} ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contiguous Purchase Module */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              {catName && <span>{catName}</span>}
              {catName && <span aria-hidden="true">·</span>}
              <span className={product.stock > 0 ? 'text-zinc-300' : 'text-red-400'}>
                {product.stock > 0
                  ? `${product.stock} ${t.product.availableUnits}`
                  : t.product.outOfStock}
              </span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white tracking-tight text-balance">
              {name}
            </h1>

            <p className="text-sm text-zinc-300 leading-relaxed">{shortDesc}</p>
          </div>

          <div className="flex items-baseline gap-3 tabular-nums pt-2 border-t border-white/[0.08]">
            <span className="text-2xl sm:text-3xl font-semibold text-white">
              {formatTnd(finalPrice, lang)}
            </span>
            {hasPromo && (
              <span className="text-base text-zinc-500 line-through">
                {formatTnd(originalWithDelta, lang)}
              </span>
            )}
          </div>

          {product.variations.length > 0 && (
            <div className="space-y-2.5">
              <span className="text-xs font-medium text-zinc-400 block">
                {t.product.variation}
              </span>
              <div className="flex flex-wrap gap-2">
                {product.variations.map((v) => {
                  const active = selectedVariation?.id === v.id;
                  const label = lang === 'ar' ? v.label_ar : v.label_fr;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariation(v)}
                      className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
                        active
                          ? 'bg-white text-zinc-950 border-white'
                          : 'bg-white/[0.03] text-zinc-200 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {label}
                      {v.price_delta !== 0 && (
                        <span className="ms-1.5 opacity-75 tabular-nums">
                          ({v.price_delta > 0 ? `+${v.price_delta}` : v.price_delta} TND)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <span className="text-xs font-medium text-zinc-400 block">{t.product.quantity}</span>
            <div className="inline-flex items-center rounded-xl border border-white/10 bg-black/40">
              <button
                type="button"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-300 hover:text-white disabled:opacity-35 cursor-pointer"
                aria-label="Diminuer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="px-4 text-sm font-semibold text-white tabular-nums">{quantity}</span>
              <button
                type="button"
                disabled={quantity >= product.stock}
                onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-300 hover:text-white disabled:opacity-35 cursor-pointer"
                aria-label="Augmenter"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              disabled={product.stock <= 0}
              onClick={handleAdd}
              className="min-h-[48px] px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-white disabled:opacity-40 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {justAdded ? <Check className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
              <span>{justAdded ? t.product.addedFeedback : t.product.addToCart}</span>
            </button>

            <button
              type="button"
              disabled={product.stock <= 0}
              onClick={handleBuyNow}
              className="min-h-[48px] px-5 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-40 text-sm font-semibold inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              {t.product.buyNow}
            </button>
          </div>

          <div className="pt-4 border-t border-white/[0.08] flex items-center gap-2.5 text-xs text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-zinc-300 shrink-0" />
            <span>{t.product.codAssurance}</span>
          </div>

          {fullDesc && (
            <div className="pt-4 border-t border-white/[0.08]">
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{fullDesc}</p>
            </div>
          )}
        </div>
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <section className="mt-20 pt-14 border-t border-white/[0.08]">
          <h2 className="font-display text-2xl font-semibold text-white mb-8">
            {t.product.relatedTitle}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {related.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                category={categories.find((c) => c.slug === item.category_slug)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Mobile Sticky Bottom Buy Bar (<= 15% mobile viewport height) */}
      {product.stock > 0 && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 glass-nav border-t border-white/10 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="tabular-nums">
            <span className="text-sm font-semibold text-white block">
              {formatTnd(finalPrice, lang)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleBuyNow}
            className="min-h-[44px] px-5 rounded-xl bg-white text-zinc-950 text-xs font-semibold whitespace-nowrap shrink-0"
          >
            {t.product.buyNow}
          </button>
        </div>
      )}
    </div>
  );
}
