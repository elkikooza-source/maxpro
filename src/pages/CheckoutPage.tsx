import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banknote, Loader2 } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatTnd } from '../i18n/translations';
import { SafeImage } from '../components/SafeImage';

export default function CheckoutPage() {
  const {
    lang,
    t,
    cart,
    cartSubtotal,
    cartShippingFee,
    cartTotal,
    clearCart,
    refreshStorefront,
  } = useStore();
  const navigate = useNavigate();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || submitting) return;
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          city: city.trim(),
          address: address.trim(),
          note: note.trim(),
          language: lang,
          items: cart.map((item) => ({
            product_id: item.product_id,
            variation_id: item.variation_id,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Erreur lors de la validation.');
        setSubmitting(false);
        return;
      }

      clearCart();
      await refreshStorefront();
      navigate(`/order/${encodeURIComponent(data.order.order_number)}`, {
        state: { order: data.order },
      });
    } catch {
      setError('Impossible de contacter le serveur. Veuillez réessayer.');
      setSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-screen pt-40 pb-20 max-w-xl mx-auto px-4 text-center space-y-6">
        <h1 className="font-display text-2xl font-semibold text-white">{t.checkout.title}</h1>
        <p className="text-sm text-zinc-400">{t.checkout.emptyCart}</p>
        <Link
          to="/shop"
          className="min-h-[44px] px-6 rounded-xl bg-white text-zinc-950 text-sm font-semibold inline-flex items-center"
        >
          {t.cart.emptyCta}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 sm:pt-36 pb-20 max-w-6xl mx-auto px-4 sm:px-6">
      <header className="mb-10 space-y-2">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white tracking-tight">
          {t.checkout.title}
        </h1>
        <p className="text-sm text-zinc-400">{t.checkout.subtitle}</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <form onSubmit={handleSubmit} className="lg:col-span-7 glass-panel rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
            <Banknote className="w-5 h-5 text-zinc-200 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-white">{t.checkout.paymentMethodTitle}</h2>
              <p className="text-xs text-zinc-400 mt-1">{t.checkout.paymentMethodDesc}</p>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs sm:text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-300">{t.checkout.fullName} *</span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-black/40 border border-white/10 text-sm text-white focus:outline-none focus:border-white/35"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-300">{t.checkout.phone} *</span>
              <input
                type="tel"
                required
                dir="ltr"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+216 XX XXX XXX"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/35"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-300">{t.checkout.city} *</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              list="tunisia-cities"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-black/40 border border-white/10 text-sm text-white focus:outline-none focus:border-white/35"
            />
            <datalist id="tunisia-cities">
              <option value="Tunis" />
              <option value="Hammam Lif" />
              <option value="Ben Arous" />
              <option value="Ariana" />
              <option value="La Marsa" />
              <option value="Nabeul" />
              <option value="Hammamet" />
              <option value="Sousse" />
              <option value="Monastir" />
              <option value="Sfax" />
              <option value="Bizerte" />
              <option value="Gabès" />
            </datalist>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-300">{t.checkout.address} *</span>
            <input
              type="text"
              required
              minLength={5}
              maxLength={250}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-black/40 border border-white/10 text-sm text-white focus:outline-none focus:border-white/35"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-300">
              {t.checkout.note} ({t.checkout.optional})
            </span>
            <textarea
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-3.5 rounded-xl bg-black/40 border border-white/10 text-sm text-white focus:outline-none focus:border-white/35"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[50px] rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-60 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{submitting ? t.checkout.submitting : t.checkout.confirmOrder}</span>
          </button>
        </form>

        <aside className="lg:col-span-5 glass-surface rounded-2xl p-6 sm:p-8 space-y-6">
          <h2 className="text-lg font-semibold text-white">{t.checkout.summaryTitle}</h2>

          <div className="space-y-4">
            {cart.map((item) => {
              const title = lang === 'ar' ? item.name_ar : item.name_fr;
              const varLabel = lang === 'ar' ? item.variation_label_ar : item.variation_label_fr;
              return (
                <div key={item.key} className="flex items-center gap-3.5">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-white/[0.06]">
                    <SafeImage src={item.image_url} alt={title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{title}</p>
                    <p className="text-xs text-zinc-400">
                      {varLabel ? `${varLabel} · ` : ''}× {item.quantity}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-white tabular-nums">
                    {formatTnd(item.unit_price * item.quantity, lang)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-white/[0.08] space-y-2.5 text-sm">
            <div className="flex items-center justify-between text-zinc-400">
              <span>{t.cart.subtotal}</span>
              <span className="tabular-nums text-zinc-200">{formatTnd(cartSubtotal, lang)}</span>
            </div>
            <div className="flex items-center justify-between text-zinc-400">
              <span>{t.cart.shipping}</span>
              <span className="tabular-nums text-zinc-200">
                {cartShippingFee === 0 ? t.cart.shippingFree : formatTnd(cartShippingFee, lang)}
              </span>
            </div>
            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-base font-semibold text-white">
              <span>{t.cart.total}</span>
              <span className="tabular-nums">{formatTnd(cartTotal, lang)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
