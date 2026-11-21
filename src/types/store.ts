export type Language = 'fr' | 'ar';

export type OrderStatus =
  | 'En attente'
  | 'Confirmée'
  | 'En préparation'
  | 'Expédiée'
  | 'Livrée'
  | 'Annulée';

export const ORDER_STATUSES: OrderStatus[] = [
  'En attente',
  'Confirmée',
  'En préparation',
  'Expédiée',
  'Livrée',
  'Annulée',
];

export interface Category {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string;
  description_fr: string;
  description_ar: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}

export interface ProductVariation {
  id: string;
  label_fr: string;
  label_ar: string;
  price_delta: number;
}

export interface Product {
  id: string;
  slug: string;
  category_slug: string;
  name_fr: string;
  name_ar: string;
  short_desc_fr: string;
  short_desc_ar: string;
  description_fr: string;
  description_ar: string;
  price: number;
  sale_price: number | null;
  stock: number;
  images: string[];
  variations: ProductVariation[];
  is_visible: boolean;
  is_featured: boolean;
  is_bestseller: boolean;
  is_new_arrival: boolean;
  sales_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_slug: string;
  product_name_fr: string;
  product_name_ar: string;
  variation_label_fr: string;
  variation_label_ar: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  address: string;
  note: string;
  status: OrderStatus;
  subtotal: number;
  shipping_fee: number;
  total: number;
  payment_method: string;
  language: Language;
  created_at: string;
  updated_at?: string;
  items?: OrderItem[];
}

export interface SiteSettings {
  brand_name: string;
  brand_tagline: string;
  logo_url: string;
  hero_image: string;
  hero_title_fr: string;
  hero_title_ar: string;
  hero_subtitle_fr: string;
  hero_subtitle_ar: string;
  promo_enabled: boolean;
  promo_text_fr: string;
  promo_text_ar: string;
  shipping_fee: number;
  free_shipping_threshold: number;
  contact_location_fr: string;
  contact_location_ar: string;
  contact_email: string;
  contact_phone: string;
  contact_whatsapp: string;
  featured_product_ids: string[];
}

export interface CartItem {
  key: string;
  product_id: string;
  product_slug: string;
  name_fr: string;
  name_ar: string;
  image_url: string;
  variation_id: string | null;
  variation_label_fr: string;
  variation_label_ar: string;
  unit_price: number;
  quantity: number;
  max_stock: number;
}

export interface AdminOverviewStats {
  revenue_today: number;
  revenue_week: number;
  revenue_month: number;
  revenue_total: number;
  orders_total: number;
  orders_by_status: Record<OrderStatus, number>;
  low_stock_products: Product[];
  storage_mode: 'supabase' | 'sqlite';
  supabase_configured: boolean;
  supabase_error?: string;
}
