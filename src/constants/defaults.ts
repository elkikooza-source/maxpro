import type { SiteSettings } from '../types/store';

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  brand_name: 'maxPro',
  brand_tagline: 'accessoires auto',
  logo_url: '',
  hero_image: '/src/assets/images/hero_cabin_obsidian_1795263599008.jpg',
  hero_title_fr: 'Sublimez votre conduite.',
  hero_title_ar: 'ارتقِ بتجربة قيادتك.',
  hero_subtitle_fr: 'Chaque détail compte.',
  hero_subtitle_ar: 'كل تفصيل يصنع الفارق.',
  promo_enabled: true,
  promo_text_fr: 'Livraison offerte partout en Tunisie dès 180 TND · Paiement à la livraison',
  promo_text_ar: 'توصيل مجاني في كامل تونس ابتداءً من 180 د.ت · الدفع عند الاستلام',
  shipping_fee: 8,
  free_shipping_threshold: 180,
  contact_location_fr: 'Hammam Lif, Tunisie',
  contact_location_ar: 'حمام الأنف، تونس',
  contact_email: 'zayani_abdelmonem@yahoo.fr',
  contact_phone: '+216 52088950',
  contact_whatsapp: '21652088950',
  featured_product_ids: [
    'prod-parfum-cuir-ambre',
    'prod-tapis-sur-mesure',
    'prod-diffuseur-cristal',
    'prod-coffret-soin',
  ],
};
