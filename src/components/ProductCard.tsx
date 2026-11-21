import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatTnd } from '../i18n/translations';
import type { Category, Product } from '../types/store';
import { SafeImage } from './SafeImage';

interface ProductCardProps {
  product: Product;
  category?: Category;
}

export function ProductCard({ product, category }: ProductCardProps) {
  const { lang, t, addToCart } = useStore();

  const name = lang === 'ar' ? product.name_ar : product.name_fr;
  const catName = category ? (lang === 'ar' ? category.name_ar : category.name_fr) : '';
  const hasPromo = product.sale_price !== null && product.sale_price < product.price;
  const activePrice = hasPromo ? product.sale_price! : product.price;

  const statusText =
    product.stock <= 0
      ? t.shop.outOfStock
      : product.stock <= 5
      ? t.shop.lowStock
      : product.is_new_arrival
      ? t.shop.newLabel
      : product.is_bestseller
      ? t.shop.bestsellerLabel
      : t.shop.inStock;

  return (
    <article className="group flex flex-col rounded-2xl glass-surface overflow-hidden transition-transform duration-200 ease-out hover:-translate-y-0.5">
      <Link
        to={`/product/${product.slug}`}
        className="relative aspect-[4/3] w-full bg-[#0c0e13] overflow-hidden block"
      >
        <SafeImage
          src={product.images[0]}
          alt={name}
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      </Link>

      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1.5">
            {catName && <span className="truncate">{catName}</span>}
            {catName && <span aria-hidden="true">·</span>}
            <span className={product.stock <= 0 ? 'text-red-400' : 'text-zinc-400'}>
              {statusText}
            </span>
          </div>

          <Link to={`/product/${product.slug}`} className="block">
            <h3 className="text-base font-semibold text-white leading-snug group-hover:text-zinc-300 transition-colors line-clamp-2">
              {name}
            </h3>
          </Link>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="text-[15px] font-semibold text-white">
              {formatTnd(activePrice, lang)}
            </span>
            {hasPromo && (
              <span className="text-xs text-zinc-500 line-through">
                {formatTnd(product.price, lang)}
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={product.stock <= 0}
            onClick={() => addToCart(product, product.variations[0] || null, 1, true)}
            className="min-h-[38px] px-3.5 rounded-xl bg-white/[0.07] hover:bg-white text-zinc-100 hover:text-zinc-950 disabled:opacity-40 disabled:pointer-events-none border border-white/10 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.shop.addToCart}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
