import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SITE_SETTINGS } from '../constants/defaults';
import { TRANSLATIONS } from '../i18n/translations';
import type {
  CartItem,
  Category,
  Language,
  Product,
  ProductVariation,
  SiteSettings,
} from '../types/store';

interface StoreContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (typeof TRANSLATIONS)['fr'] | (typeof TRANSLATIONS)['ar'];
  settings: SiteSettings;
  categories: Category[];
  products: Product[];
  loading: boolean;
  refreshStorefront: () => Promise<void>;
  cart: CartItem[];
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addToCart: (product: Product, variation: ProductVariation | null, quantity?: number, openDrawer?: boolean) => void;
  updateCartQty: (key: string, quantity: number) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
  cartSubtotal: number;
  cartShippingFee: number;
  cartTotal: number;
  cartCount: number;
  adminToken: string | null;
  setAdminToken: (token: string | null) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const LANG_STORAGE_KEY = 'maxpro_lang';
const CART_STORAGE_KEY = 'maxpro_cart';

function getInitialLang(): Language {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'ar' ? 'ar' : 'fr';
  } catch {
    return 'fr';
  }
}

function getInitialCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(getInitialLang);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>(getInitialCart);
  const [cartOpen, setCartOpen] = useState(false);

  // Admin signed HMAC token lives strictly in React memory (never persisted in localStorage/sessionStorage)
  const [adminToken, setAdminToken] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // Ignore storage failures
    }
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage failures
    }
  }, [cart]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'fr' ? 'ar' : 'fr'));
  }, []);

  const refreshStorefront = useCallback(async () => {
    try {
      const res = await fetch('/api/storefront');
      if (!res.ok) return;
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      if (Array.isArray(data.categories)) setCategories(data.categories);
      if (Array.isArray(data.products)) setProducts(data.products);
    } catch {
      // Keep current state on transient network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStorefront();
  }, [refreshStorefront]);

  const addToCart = useCallback(
    (product: Product, variation: ProductVariation | null, quantity = 1, openDrawer = true) => {
      if (product.stock <= 0) return;
      const basePrice =
        product.sale_price !== null && product.sale_price < product.price
          ? product.sale_price
          : product.price;
      const unitPrice = Number((basePrice + (variation?.price_delta || 0)).toFixed(2));
      const key = `${product.id}::${variation?.id || 'default'}`;

      setCart((prev) => {
        const idx = prev.findIndex((item) => item.key === key);
        if (idx >= 0) {
          const updated = [...prev];
          const nextQty = Math.min(product.stock, updated[idx].quantity + quantity);
          updated[idx] = {
            ...updated[idx],
            quantity: nextQty,
            unit_price: unitPrice,
            max_stock: product.stock,
          };
          return updated;
        }
        return [
          ...prev,
          {
            key,
            product_id: product.id,
            product_slug: product.slug,
            name_fr: product.name_fr,
            name_ar: product.name_ar,
            image_url: product.images[0] || '',
            variation_id: variation?.id || null,
            variation_label_fr: variation?.label_fr || '',
            variation_label_ar: variation?.label_ar || '',
            unit_price: unitPrice,
            quantity: Math.min(product.stock, Math.max(1, quantity)),
            max_stock: product.stock,
          },
        ];
      });

      if (openDrawer) {
        setCartOpen(true);
      }
    },
    []
  );

  const updateCartQty = useCallback((key: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.key !== key));
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.key === key
          ? { ...item, quantity: Math.min(item.max_stock || 20, Math.max(1, quantity)) }
          : item
      )
    );
  }, []);

  const removeFromCart = useCallback((key: string) => {
    setCart((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const cartSubtotal = useMemo(
    () => Number(cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0).toFixed(2)),
    [cart]
  );

  const cartShippingFee = useMemo(() => {
    if (cart.length === 0) return 0;
    return cartSubtotal >= settings.free_shipping_threshold ? 0 : settings.shipping_fee;
  }, [cart.length, cartSubtotal, settings.free_shipping_threshold, settings.shipping_fee]);

  const cartTotal = useMemo(
    () => Number((cartSubtotal + cartShippingFee).toFixed(2)),
    [cartSubtotal, cartShippingFee]
  );

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  const value: StoreContextValue = {
    lang,
    setLang,
    toggleLang,
    t: TRANSLATIONS[lang],
    settings,
    categories,
    products,
    loading,
    refreshStorefront,
    cart,
    cartOpen,
    setCartOpen,
    addToCart,
    updateCartQty,
    removeFromCart,
    clearCart,
    cartSubtotal,
    cartShippingFee,
    cartTotal,
    cartCount,
    adminToken,
    setAdminToken,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
