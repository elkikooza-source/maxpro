import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatTnd } from '../i18n/translations';
import { SafeImage } from './SafeImage';

export function CartDrawer() {
  const {
    lang,
    t,
    settings,
    cart,
    cartOpen,
    setCartOpen,
    updateCartQty,
    removeFromCart,
    cartSubtotal,
    cartShippingFee,
    cartTotal,
  } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!cartOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCartOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [cartOpen, setCartOpen]);

  if (!cartOpen) return null;

  const threshold = settings.free_shipping_threshold;
  const remainingForFree = Math.max(0, threshold - cartSubtotal);
  const progressPct = threshold > 0 ? Math.min(100, (cartSubtotal / threshold) * 100) : 100;

  const handleCheckout = () => {
    setCartOpen(false);
    navigate('/checkout');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm transition-opacity"
        onClick={() => setCartOpen(false)}
        aria-hidden="true"
      />

      <aside
        className="relative z-10 w-full max-w-md h-[100dvh] glass-panel border-s border-white/10 flex flex-col shadow-2xl"
        role="dialog"
        aria-label={t.cart.title}
      >
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-white" />
            <h2 className="text-base sm:text-lg font-semibold text-white">{t.cart.title}</h2>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {cart.length > 0 && threshold > 0 && (
          <div className="px-4 sm:px-6 py-3 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
            <p className="text-xs text-zinc-300 mb-2">
              {remainingForFree === 0
                ? t.cart.freeShippingUnlocked
                : t.cart.freeShippingHint.replace('{amount}', formatTnd(remainingForFree, lang))}
            </p>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-5 space-y-5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <ShoppingBag className="w-10 h-10 text-zinc-600 mb-4" />
              <p className="text-sm text-zinc-400 mb-6">{t.cart.empty}</p>
              <button
                type="button"
                onClick={() => {
                  setCartOpen(false);
                  navigate('/shop');
                }}
                className="min-h-[44px] px-6 rounded-xl bg-white text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                {t.cart.emptyCta}
              </button>
            </div>
          ) : (
            cart.map((item) => {
              const title = lang === 'ar' ? item.name_ar : item.name_fr;
              const varLabel = lang === 'ar' ? item.variation_label_ar : item.variation_label_fr;
              return (
                <div
                  key={item.key}
                  className="flex gap-4 pb-5 border-b border-white/[0.06] last:border-b-0"
                >
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-white/[0.08]">
                    <SafeImage
                      src={item.image_url}
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-white truncate">{title}</h3>
                        {varLabel && <p className="text-xs text-zinc-400 mt-0.5 truncate">{varLabel}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.key)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors shrink-0 cursor-pointer"
                        aria-label={t.cart.remove}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03]">
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.key, item.quantity - 1)}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
                          aria-label="Diminuer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2.5 text-xs font-medium text-white tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.key, item.quantity + 1)}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
                          aria-label="Augmenter"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="text-sm font-semibold text-white tabular-nums">
                        {formatTnd(item.unit_price * item.quantity, lang)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {cart.length > 0 && (
          <div className="px-4 sm:px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-6 border-t border-white/[0.08] bg-black/50 space-y-4 shrink-0">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between text-zinc-400">
                <span>{t.cart.subtotal}</span>
                <span className="tabular-nums text-white">{formatTnd(cartSubtotal, lang)}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>{t.cart.shipping}</span>
                <span className="tabular-nums text-white">
                  {cartShippingFee === 0 ? t.cart.shippingFree : formatTnd(cartShippingFee, lang)}
                </span>
              </div>
              <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-base font-semibold text-white">
                <span>{t.cart.total}</span>
                <span className="tabular-nums">{formatTnd(cartTotal, lang)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCheckout}
              className="w-full min-h-[48px] rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 font-semibold text-sm transition-colors cursor-pointer"
            >
              {t.cart.checkoutCta}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
