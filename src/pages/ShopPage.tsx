import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';

type SortOption = 'featured' | 'price_asc' | 'price_desc' | 'newest' | 'bestsellers';

export default function ShopPage() {
  const { lang, t, categories, products, loading } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'all');
  const [sort, setSort] = useState<SortOption>(
    (searchParams.get('sort') as SortOption) || 'featured'
  );
  const [onlyBestsellers, setOnlyBestsellers] = useState(searchParams.get('bestseller') === 'true');
  const [onlyNew, setOnlyNew] = useState(searchParams.get('new') === 'true');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  useEffect(() => {
    const catParam = searchParams.get('category');
    if (catParam) setSelectedCategory(catParam);
    setOnlyBestsellers(searchParams.get('bestseller') === 'true');
    setOnlyNew(searchParams.get('new') === 'true');
  }, [searchParams]);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.slug, c])), [categories]);

  const filteredProducts = useMemo(() => {
    let list = [...products];

    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category_slug === selectedCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name_fr.toLowerCase().includes(q) ||
          p.name_ar.toLowerCase().includes(q) ||
          p.short_desc_fr.toLowerCase().includes(q) ||
          p.short_desc_ar.toLowerCase().includes(q)
      );
    }
    if (onlyBestsellers) {
      list = list.filter((p) => p.is_bestseller);
    }
    if (onlyNew) {
      list = list.filter((p) => p.is_new_arrival);
    }
    if (minPrice !== '') {
      const min = Number(minPrice);
      if (Number.isFinite(min)) {
        list = list.filter((p) => (p.sale_price ?? p.price) >= min);
      }
    }
    if (maxPrice !== '') {
      const max = Number(maxPrice);
      if (Number.isFinite(max)) {
        list = list.filter((p) => (p.sale_price ?? p.price) <= max);
      }
    }

    if (sort === 'price_asc') {
      list.sort((a, b) => (a.sale_price ?? a.price) - (b.sale_price ?? b.price));
    } else if (sort === 'price_desc') {
      list.sort((a, b) => (b.sale_price ?? b.price) - (a.sale_price ?? a.price));
    } else if (sort === 'bestsellers') {
      list.sort((a, b) => b.sales_count - a.sales_count);
    } else if (sort === 'newest') {
      list.sort((a, b) => Number(b.is_new_arrival) - Number(a.is_new_arrival));
    } else {
      list.sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
    }

    return list;
  }, [products, selectedCategory, search, onlyBestsellers, onlyNew, minPrice, maxPrice, sort]);

  const resetFilters = () => {
    setSearch('');
    setSelectedCategory('all');
    setSort('featured');
    setOnlyBestsellers(false);
    setOnlyNew(false);
    setMinPrice('');
    setMaxPrice('');
    setSearchParams({});
  };

  const hasActiveFilters =
    search !== '' ||
    selectedCategory !== 'all' ||
    onlyBestsellers ||
    onlyNew ||
    minPrice !== '' ||
    maxPrice !== '';

  return (
    <div className="min-h-screen pt-32 sm:pt-36 pb-20 max-w-7xl mx-auto px-4 sm:px-6">
      <header className="mb-10 space-y-2">
        <h1 className="font-display text-3xl sm:text-5xl font-semibold text-white tracking-tight">
          {t.shop.title}
        </h1>
        <p className="text-sm sm:text-base text-zinc-400">{t.shop.subtitle}</p>
      </header>

      {/* Filter & Search Toolbar */}
      <section className="glass-surface rounded-2xl p-4 sm:p-5 mb-8 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.shop.searchPlaceholder}
              className="w-full min-h-[44px] ps-10 pe-4 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
            />
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder={t.shop.minPrice}
                className="w-24 sm:w-28 min-h-[44px] px-3 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder:text-zinc-500 tabular-nums focus:outline-none focus:border-white/30"
              />
              <span className="text-zinc-600">-</span>
              <input
                type="number"
                min={0}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder={t.shop.maxPrice}
                className="w-24 sm:w-28 min-h-[44px] px-3 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder:text-zinc-500 tabular-nums focus:outline-none focus:border-white/30"
              />
            </div>

            <div className="relative flex-1 sm:flex-initial">
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="w-full sm:w-48 min-h-[44px] ps-9 pe-3 rounded-xl bg-black/50 border border-white/10 text-sm text-zinc-200 focus:outline-none focus:border-white/30 cursor-pointer"
              >
                <option value="featured">{t.shop.sortFeatured}</option>
                <option value="price_asc">{t.shop.sortPriceAsc}</option>
                <option value="price_desc">{t.shop.sortPriceDesc}</option>
                <option value="newest">{t.shop.sortNewest}</option>
                <option value="bestsellers">{t.shop.sortBestsellers}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Horizontal Scrollable Category Rail + Quick Toggles */}
        <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mb-1 max-w-full">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-white text-zinc-950'
                  : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.09]'
              }`}
            >
              {t.shop.allCategories}
            </button>

            {categories.map((cat) => {
              const active = selectedCategory === cat.slug;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-white text-zinc-950'
                      : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.09]'
                  }`}
                >
                  {lang === 'ar' ? cat.name_ar : cat.name_fr}
                </button>
              );
            })}

            <span className="text-zinc-700 px-1" aria-hidden="true">
              |
            </span>

            <button
              type="button"
              onClick={() => setOnlyBestsellers((v) => !v)}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                onlyBestsellers
                  ? 'bg-zinc-200 text-zinc-950 border-white'
                  : 'border-white/10 text-zinc-300 hover:bg-white/[0.06]'
              }`}
            >
              {t.shop.onlyBestsellers}
            </button>

            <button
              type="button"
              onClick={() => setOnlyNew((v) => !v)}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                onlyNew
                  ? 'bg-zinc-200 text-zinc-950 border-white'
                  : 'border-white/10 text-zinc-300 hover:bg-white/[0.06]'
              }`}
            >
              {t.shop.onlyNew}
            </button>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="hidden sm:inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>{t.shop.resetFilters}</span>
            </button>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between mb-6 text-xs text-zinc-400">
        <span className="tabular-nums">
          {filteredProducts.length} {t.shop.resultsCount}
        </span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="sm:hidden inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
            <span>{t.shop.resetFilters}</span>
          </button>
        )}
      </div>

      {loading && products.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-2xl glass-surface h-80 animate-pulse bg-white/[0.03]" />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="glass-surface rounded-2xl p-12 text-center space-y-4">
          <p className="text-base text-zinc-300">{t.shop.emptyTitle}</p>
          <button
            type="button"
            onClick={resetFilters}
            className="min-h-[44px] px-6 rounded-xl bg-white text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors cursor-pointer"
          >
            {t.shop.emptyCta}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              category={categoryMap.get(product.category_slug)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
