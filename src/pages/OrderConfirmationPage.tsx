import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatTnd, ORDER_STATUS_LABELS } from '../i18n/translations';
import type { Order } from '../types/store';

export default function OrderConfirmationPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const location = useLocation();
  const { lang, t, settings } = useStore();

  const initialOrder = (location.state as { order?: Order } | null)?.order || null;
  const [order, setOrder] = useState<Order | null>(initialOrder);
  const [loading, setLoading] = useState(!initialOrder);

  useEffect(() => {
    if (initialOrder && initialOrder.order_number === orderNumber) return;
    let active = true;
    setLoading(true);

    fetch(`/api/orders/${encodeURIComponent(orderNumber || '')}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active) setOrder(data?.order || null);
      })
      .catch(() => {
        if (active) setOrder(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orderNumber, initialOrder]);

  if (loading) {
    return (
      <div className="min-h-screen pt-40 pb-20 max-w-2xl mx-auto px-4">
        <div className="h-80 rounded-2xl glass-surface animate-pulse" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen pt-40 pb-20 max-w-xl mx-auto px-4 text-center space-y-5">
        <h1 className="font-display text-2xl font-semibold text-white">{t.order.notFound}</h1>
        <Link
          to="/shop"
          className="min-h-[44px] px-6 rounded-xl bg-white text-zinc-950 text-sm font-semibold inline-flex items-center"
        >
          {t.order.continueShopping}
        </Link>
      </div>
    );
  }

  const statusLabel = ORDER_STATUS_LABELS[order.status]?.[lang] || order.status;
  const whatsappClean = (settings.contact_whatsapp || '21652088950').replace(/[^\d]/g, '');

  return (
    <div className="min-h-screen pt-32 sm:pt-36 pb-20 max-w-3xl mx-auto px-4 sm:px-6">
      <div className="glass-panel rounded-3xl p-6 sm:p-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div className="flex items-start gap-3.5">
            <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white">
                {t.order.confirmedTitle}
              </h1>
              <p className="text-sm text-zinc-400 mt-1">{t.order.confirmedSubtitle}</p>
            </div>
          </div>

          <div className="text-start sm:text-end">
            <span className="text-xs text-zinc-400 block">{t.order.orderNumber}</span>
            <span dir="ltr" className="text-lg font-mono font-semibold text-white tabular-nums">
              {order.order_number}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <div className="space-y-1.5">
            <span className="text-xs uppercase tracking-wider text-zinc-400 block">
              {t.order.deliveryDetails}
            </span>
            <p className="font-medium text-white">{order.customer_name}</p>
            <p dir="ltr" className="text-zinc-300">
              {order.customer_phone}
            </p>
            <p className="text-zinc-300">
              {order.address}, {order.city}
            </p>
            {order.note && <p className="text-xs text-zinc-400 pt-1">{order.note}</p>}
          </div>

          <div className="space-y-2">
            <div>
              <span className="text-xs uppercase tracking-wider text-zinc-400 block">
                {t.order.status}
              </span>
              <p className="text-white font-medium mt-0.5">{statusLabel}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-zinc-400 block">
                {t.checkout.paymentMethodTitle}
              </span>
              <p className="text-zinc-300 mt-0.5">{t.order.paymentCod}</p>
            </div>
          </div>
        </div>

        {order.items && order.items.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-white/[0.08]">
            <h2 className="text-sm font-semibold text-white">{t.order.itemsTitle}</h2>
            <div className="divide-y divide-white/[0.06]">
              {order.items.map((item) => {
                const name = lang === 'ar' ? item.product_name_ar : item.product_name_fr;
                const varLabel =
                  lang === 'ar' ? item.variation_label_ar : item.variation_label_fr;
                return (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                    <div>
                      <p className="text-white font-medium">{name}</p>
                      <p className="text-xs text-zinc-400">
                        {varLabel ? `${varLabel} · ` : ''}× {item.quantity}
                      </p>
                    </div>
                    <span className="tabular-nums font-medium text-white">
                      {formatTnd(item.line_total, lang)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-white/[0.08] space-y-2 text-sm">
          <div className="flex justify-between text-zinc-400">
            <span>{t.cart.subtotal}</span>
            <span className="tabular-nums text-zinc-200">{formatTnd(order.subtotal, lang)}</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>{t.cart.shipping}</span>
            <span className="tabular-nums text-zinc-200">
              {order.shipping_fee === 0 ? t.cart.shippingFree : formatTnd(order.shipping_fee, lang)}
            </span>
          </div>
          <div className="pt-2 border-t border-white/[0.08] flex justify-between text-base font-semibold text-white">
            <span>{t.cart.total}</span>
            <span className="tabular-nums">{formatTnd(order.total, lang)}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            to="/shop"
            className="min-h-[46px] px-6 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 transition-colors text-sm font-semibold inline-flex items-center justify-center"
          >
            {t.order.continueShopping}
          </Link>

          <a
            href={`https://wa.me/${whatsappClean}?text=${encodeURIComponent(`Bonjour maxPro, suivi commande ${order.order_number}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[46px] px-6 rounded-xl border border-white/15 text-zinc-200 hover:bg-white/[0.06] transition-colors text-sm font-medium inline-flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{t.home.whatsappCta}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
