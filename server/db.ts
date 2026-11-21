import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AdminOverviewStats,
  Category,
  Language,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductVariation,
  SiteSettings,
} from '../src/types/store.js';
import { ORDER_STATUSES } from '../src/types/store.js';
import { DEFAULT_SITE_SETTINGS, SEED_CATEGORIES, SEED_PRODUCTS } from './seedData.js';
import { resolveConfinedPath, sanitizeSlug, type SupportedImageFormat } from './security.js';

export interface AdminAuthRecord {
  id: string;
  password_hash: string;
  password_salt: string;
}

export interface LoginAttemptRecord {
  ip: string;
  attempts: number;
  locked_until: string | null;
  last_attempt_at: string;
}

export interface CreateOrderInput {
  customer_name: string;
  customer_phone: string;
  city: string;
  address: string;
  note: string;
  language: Language;
  items: Array<{
    product_id: string;
    variation_id: string | null;
    quantity: number;
  }>;
}

function normalizeSupabaseUrl(raw: string | undefined): string {
  if (!raw) return '';
  let url = raw.trim().replace(/\/+$/, '');
  if (url.endsWith('/rest/v1')) {
    url = url.slice(0, -'/rest/v1'.length);
  }
  return url;
}

class StoreDatabase {
  private sqlite: Database.Database;
  private supabaseUrl: string;
  private supabaseKey: string;
  private storageBucket: string;
  private activeMode: 'supabase' | 'sqlite' = 'sqlite';
  private supabaseError: string = '';
  private uploadsDir: string;

  constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }

    this.sqlite = new Database(path.join(dataDir, 'maxpro.db'));
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.initSqliteSchema();
    this.seedSqliteIfEmpty();

    this.supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
    this.supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    this.storageBucket = (process.env.SUPABASE_STORAGE_BUCKET || 'maxpro-media').trim() || 'maxpro-media';
  }

  public getUploadsDir(): string {
    return this.uploadsDir;
  }

  public isSupabaseConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.supabaseKey);
  }

  public getStatus(): { mode: 'supabase' | 'sqlite'; configured: boolean; error: string } {
    return {
      mode: this.activeMode,
      configured: this.isSupabaseConfigured(),
      error: this.supabaseError,
    };
  }

  private initSqliteSchema(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name_fr TEXT NOT NULL,
        name_ar TEXT NOT NULL,
        description_fr TEXT DEFAULT '',
        description_ar TEXT DEFAULT '',
        image_url TEXT DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        category_slug TEXT NOT NULL,
        name_fr TEXT NOT NULL,
        name_ar TEXT NOT NULL,
        short_desc_fr TEXT DEFAULT '',
        short_desc_ar TEXT DEFAULT '',
        description_fr TEXT DEFAULT '',
        description_ar TEXT DEFAULT '',
        price REAL NOT NULL,
        sale_price REAL NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        images TEXT NOT NULL DEFAULT '[]',
        variations TEXT NOT NULL DEFAULT '[]',
        is_visible INTEGER NOT NULL DEFAULT 1,
        is_featured INTEGER NOT NULL DEFAULT 0,
        is_bestseller INTEGER NOT NULL DEFAULT 0,
        is_new_arrival INTEGER NOT NULL DEFAULT 0,
        sales_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        city TEXT NOT NULL,
        address TEXT NOT NULL,
        note TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'En attente',
        subtotal REAL NOT NULL,
        shipping_fee REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'COD',
        language TEXT NOT NULL DEFAULT 'fr',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        product_slug TEXT NOT NULL,
        product_name_fr TEXT NOT NULL,
        product_name_ar TEXT NOT NULL,
        variation_label_fr TEXT DEFAULT '',
        variation_label_ar TEXT DEFAULT '',
        unit_price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        line_total REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS admin_auth (
        id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS admin_login_attempts (
        ip TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT NULL,
        last_attempt_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  private seedSqliteIfEmpty(): void {
    const catCount = this.sqlite.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number };
    if (catCount.c === 0) {
      const insertCat = this.sqlite.prepare(
        `INSERT INTO categories (id, slug, name_fr, name_ar, description_fr, description_ar, image_url, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const tx = this.sqlite.transaction(() => {
        for (const cat of SEED_CATEGORIES) {
          insertCat.run(
            cat.id,
            cat.slug,
            cat.name_fr,
            cat.name_ar,
            cat.description_fr,
            cat.description_ar,
            cat.image_url,
            cat.sort_order,
            cat.is_active ? 1 : 0
          );
        }
      });
      tx();
    }

    const prodCount = this.sqlite.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number };
    if (prodCount.c === 0) {
      const insertProd = this.sqlite.prepare(
        `INSERT INTO products (
          id, slug, category_slug, name_fr, name_ar, short_desc_fr, short_desc_ar,
          description_fr, description_ar, price, sale_price, stock, images, variations,
          is_visible, is_featured, is_bestseller, is_new_arrival, sales_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const tx = this.sqlite.transaction(() => {
        for (const p of SEED_PRODUCTS) {
          insertProd.run(
            p.id,
            p.slug,
            p.category_slug,
            p.name_fr,
            p.name_ar,
            p.short_desc_fr,
            p.short_desc_ar,
            p.description_fr,
            p.description_ar,
            p.price,
            p.sale_price,
            p.stock,
            JSON.stringify(p.images),
            JSON.stringify(p.variations),
            p.is_visible ? 1 : 0,
            p.is_featured ? 1 : 0,
            p.is_bestseller ? 1 : 0,
            p.is_new_arrival ? 1 : 0,
            p.sales_count
          );
        }
      });
      tx();
    }

    const settingsRow = this.sqlite
      .prepare('SELECT key FROM site_settings WHERE key = ?')
      .get('global') as { key: string } | undefined;
    if (!settingsRow) {
      this.sqlite
        .prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)')
        .run('global', JSON.stringify(DEFAULT_SITE_SETTINGS));
    }
  }

  private async supabaseFetch<T>(
    tablePath: string,
    init: RequestInit = {}
  ): Promise<{ ok: boolean; status: number; data: T | null; errorText: string }> {
    if (!this.isSupabaseConfigured()) {
      return { ok: false, status: 0, data: null, errorText: 'Supabase non configuré' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const headers = new Headers(init.headers || {});
      headers.set('apikey', this.supabaseKey);
      headers.set('Authorization', `Bearer ${this.supabaseKey}`);
      if (!headers.has('Content-Type') && init.body) {
        headers.set('Content-Type', 'application/json');
      }

      const res = await fetch(`${this.supabaseUrl}/rest/v1/${tablePath}`, {
        ...init,
        headers,
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        return { ok: false, status: res.status, data: null, errorText: text.slice(0, 240) };
      }
      const parsed = text ? (JSON.parse(text) as T) : (null as T | null);
      return { ok: true, status: res.status, data: parsed, errorText: '' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur réseau Supabase';
      return { ok: false, status: 0, data: null, errorText: message };
    } finally {
      clearTimeout(timeout);
    }
  }

  public async initializeAndVerify(): Promise<{ mode: 'supabase' | 'sqlite'; configured: boolean; error: string }> {
    this.supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
    this.supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    this.storageBucket = (process.env.SUPABASE_STORAGE_BUCKET || 'maxpro-media').trim() || 'maxpro-media';

    if (!this.isSupabaseConfigured()) {
      this.activeMode = 'sqlite';
      this.supabaseError = 'Variables SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absentes — mode SQLite local actif.';
      return this.getStatus();
    }

    const probe = await this.supabaseFetch<Array<{ id: string }>>('categories?select=id&limit=1');
    if (!probe.ok) {
      this.activeMode = 'sqlite';
      if (probe.status === 403 || probe.errorText.includes('42501')) {
        this.supabaseError =
          "Privilèges Supabase manquants (42501) : exécutez supabase/schema.sql dans l'éditeur SQL Supabase pour accorder les droits à service_role. Repli SQLite actif.";
      } else {
        this.supabaseError = `Connexion Supabase indisponible (${probe.status || 'réseau'}) — repli automatique sur SQLite.`;
      }
      return this.getStatus();
    }

    // Also verify other required tables exist
    const probeSettings = await this.supabaseFetch<Array<{ key: string }>>('site_settings?select=key&limit=1');
    if (!probeSettings.ok) {
      this.activeMode = 'sqlite';
      this.supabaseError = `Tables Supabase incomplètes — exécutez supabase/schema.sql. Repli SQLite actif.`;
      return this.getStatus();
    }

    this.activeMode = 'supabase';
    this.supabaseError = '';

    // Seed Supabase if empty
    try {
      if (Array.isArray(probe.data) && probe.data.length === 0) {
        await this.supabaseFetch('categories', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates' },
          body: JSON.stringify(SEED_CATEGORIES),
        });
      }
      const prodProbe = await this.supabaseFetch<Array<{ id: string }>>('products?select=id&limit=1');
      if (prodProbe.ok && Array.isArray(prodProbe.data) && prodProbe.data.length === 0) {
        await this.supabaseFetch('products', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates' },
          body: JSON.stringify(SEED_PRODUCTS),
        });
      }
      if (Array.isArray(probeSettings.data) && probeSettings.data.length === 0) {
        await this.supabaseFetch('site_settings', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates' },
          body: JSON.stringify([{ key: 'global', value: DEFAULT_SITE_SETTINGS }]),
        });
      }
    } catch {
      // Non-fatal seeding guard
    }

    return this.getStatus();
  }

  private mapSqliteProduct(row: Record<string, unknown>): Product {
    return {
      id: String(row.id),
      slug: String(row.slug),
      category_slug: String(row.category_slug),
      name_fr: String(row.name_fr),
      name_ar: String(row.name_ar),
      short_desc_fr: String(row.short_desc_fr || ''),
      short_desc_ar: String(row.short_desc_ar || ''),
      description_fr: String(row.description_fr || ''),
      description_ar: String(row.description_ar || ''),
      price: Number(row.price),
      sale_price: row.sale_price !== null && row.sale_price !== undefined ? Number(row.sale_price) : null,
      stock: Number(row.stock),
      images: JSON.parse(String(row.images || '[]')) as string[],
      variations: JSON.parse(String(row.variations || '[]')) as ProductVariation[],
      is_visible: Boolean(row.is_visible),
      is_featured: Boolean(row.is_featured),
      is_bestseller: Boolean(row.is_bestseller),
      is_new_arrival: Boolean(row.is_new_arrival),
      sales_count: Number(row.sales_count || 0),
      created_at: String(row.created_at || ''),
      updated_at: String(row.updated_at || ''),
    };
  }

  private mapSupabaseProduct(row: Record<string, unknown>): Product {
    return {
      id: String(row.id),
      slug: String(row.slug),
      category_slug: String(row.category_slug),
      name_fr: String(row.name_fr),
      name_ar: String(row.name_ar),
      short_desc_fr: String(row.short_desc_fr || ''),
      short_desc_ar: String(row.short_desc_ar || ''),
      description_fr: String(row.description_fr || ''),
      description_ar: String(row.description_ar || ''),
      price: Number(row.price),
      sale_price: row.sale_price !== null && row.sale_price !== undefined ? Number(row.sale_price) : null,
      stock: Number(row.stock),
      images: Array.isArray(row.images) ? (row.images as string[]) : [],
      variations: Array.isArray(row.variations) ? (row.variations as ProductVariation[]) : [],
      is_visible: Boolean(row.is_visible),
      is_featured: Boolean(row.is_featured),
      is_bestseller: Boolean(row.is_bestseller),
      is_new_arrival: Boolean(row.is_new_arrival),
      sales_count: Number(row.sales_count || 0),
      created_at: String(row.created_at || ''),
      updated_at: String(row.updated_at || ''),
    };
  }

  public async getSettings(): Promise<SiteSettings> {
    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch<Array<{ key: string; value: SiteSettings }>>(
        'site_settings?key=eq.global&select=value&limit=1'
      );
      if (res.ok && res.data && res.data[0]?.value) {
        return { ...DEFAULT_SITE_SETTINGS, ...res.data[0].value };
      }
    }
    const row = this.sqlite
      .prepare('SELECT value FROM site_settings WHERE key = ?')
      .get('global') as { value: string } | undefined;
    if (!row) return { ...DEFAULT_SITE_SETTINGS };
    try {
      return { ...DEFAULT_SITE_SETTINGS, ...(JSON.parse(row.value) as Partial<SiteSettings>) };
    } catch {
      return { ...DEFAULT_SITE_SETTINGS };
    }
  }

  public async updateSettings(partial: Partial<SiteSettings>): Promise<SiteSettings> {
    const current = await this.getSettings();
    const merged: SiteSettings = { ...current, ...partial };
    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch('site_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([{ key: 'global', value: merged, updated_at: new Date().toISOString() }]),
      });
      if (res.ok) return merged;
    }
    this.sqlite
      .prepare(
        `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run('global', JSON.stringify(merged));
    return merged;
  }

  public async getCategories(onlyActive = true): Promise<Category[]> {
    if (this.activeMode === 'supabase') {
      const filter = onlyActive ? '&is_active=eq.true' : '';
      const res = await this.supabaseFetch<Category[]>(
        `categories?select=*${filter}&order=sort_order.asc`
      );
      if (res.ok && res.data) {
        return res.data;
      }
    }
    const sql = onlyActive
      ? 'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC'
      : 'SELECT * FROM categories ORDER BY sort_order ASC';
    const rows = this.sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      slug: String(r.slug),
      name_fr: String(r.name_fr),
      name_ar: String(r.name_ar),
      description_fr: String(r.description_fr || ''),
      description_ar: String(r.description_ar || ''),
      image_url: String(r.image_url || ''),
      sort_order: Number(r.sort_order || 0),
      is_active: Boolean(r.is_active),
      created_at: String(r.created_at || ''),
    }));
  }

  public async updateCategory(id: string, patch: Partial<Category>): Promise<Category | null> {
    const existing = (await this.getCategories(false)).find((c) => c.id === id);
    if (!existing) return null;
    const updated: Category = {
      ...existing,
      name_fr: patch.name_fr ?? existing.name_fr,
      name_ar: patch.name_ar ?? existing.name_ar,
      description_fr: patch.description_fr ?? existing.description_fr,
      description_ar: patch.description_ar ?? existing.description_ar,
      image_url: patch.image_url ?? existing.image_url,
      sort_order: patch.sort_order ?? existing.sort_order,
      is_active: patch.is_active ?? existing.is_active,
    };

    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch<Category[]>(
        `categories?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            name_fr: updated.name_fr,
            name_ar: updated.name_ar,
            description_fr: updated.description_fr,
            description_ar: updated.description_ar,
            image_url: updated.image_url,
            sort_order: updated.sort_order,
            is_active: updated.is_active,
          }),
        }
      );
      if (res.ok && res.data?.[0]) return res.data[0];
    }

    this.sqlite
      .prepare(
        `UPDATE categories
         SET name_fr = ?, name_ar = ?, description_fr = ?, description_ar = ?, image_url = ?, sort_order = ?, is_active = ?
         WHERE id = ?`
      )
      .run(
        updated.name_fr,
        updated.name_ar,
        updated.description_fr,
        updated.description_ar,
        updated.image_url,
        updated.sort_order,
        updated.is_active ? 1 : 0,
        id
      );
    return updated;
  }

  public async getProducts(includeHidden = false): Promise<Product[]> {
    if (this.activeMode === 'supabase') {
      const filter = includeHidden ? '' : '&is_visible=eq.true';
      const res = await this.supabaseFetch<Array<Record<string, unknown>>>(
        `products?select=*${filter}&order=created_at.desc`
      );
      if (res.ok && res.data) {
        return res.data.map((r) => this.mapSupabaseProduct(r));
      }
    }
    const sql = includeHidden
      ? 'SELECT * FROM products ORDER BY created_at DESC'
      : 'SELECT * FROM products WHERE is_visible = 1 ORDER BY created_at DESC';
    const rows = this.sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapSqliteProduct(r));
  }

  public async getProductBySlug(slug: string, includeHidden = false): Promise<Product | null> {
    if (this.activeMode === 'supabase') {
      const vis = includeHidden ? '' : '&is_visible=eq.true';
      const res = await this.supabaseFetch<Array<Record<string, unknown>>>(
        `products?slug=eq.${encodeURIComponent(slug)}${vis}&select=*&limit=1`
      );
      if (res.ok && res.data?.[0]) {
        return this.mapSupabaseProduct(res.data[0]);
      }
    }
    const sql = includeHidden
      ? 'SELECT * FROM products WHERE slug = ? LIMIT 1'
      : 'SELECT * FROM products WHERE slug = ? AND is_visible = 1 LIMIT 1';
    const row = this.sqlite.prepare(sql).get(slug) as Record<string, unknown> | undefined;
    return row ? this.mapSqliteProduct(row) : null;
  }

  public async getProductById(id: string): Promise<Product | null> {
    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch<Array<Record<string, unknown>>>(
        `products?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
      );
      if (res.ok && res.data?.[0]) {
        return this.mapSupabaseProduct(res.data[0]);
      }
    }
    const row = this.sqlite.prepare('SELECT * FROM products WHERE id = ? LIMIT 1').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapSqliteProduct(row) : null;
  }

  public async createProduct(input: Omit<Product, 'id' | 'sales_count' | 'created_at' | 'updated_at'>): Promise<Product> {
    const id = `prod-${crypto.randomBytes(6).toString('hex')}`;
    const baseSlug = sanitizeSlug(input.slug || input.name_fr) || id;
    const existingWithSlug = await this.getProductBySlug(baseSlug, true);
    const finalSlug = existingWithSlug ? `${baseSlug}-${crypto.randomBytes(2).toString('hex')}` : baseSlug;
    const now = new Date().toISOString();

    const product: Product = {
      ...input,
      id,
      slug: finalSlug,
      sales_count: 0,
      created_at: now,
      updated_at: now,
    };

    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch<Array<Record<string, unknown>>>('products', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify([product]),
      });
      if (res.ok && res.data?.[0]) {
        return this.mapSupabaseProduct(res.data[0]);
      }
    }

    this.sqlite
      .prepare(
        `INSERT INTO products (
          id, slug, category_slug, name_fr, name_ar, short_desc_fr, short_desc_ar,
          description_fr, description_ar, price, sale_price, stock, images, variations,
          is_visible, is_featured, is_bestseller, is_new_arrival, sales_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(
        product.id,
        product.slug,
        product.category_slug,
        product.name_fr,
        product.name_ar,
        product.short_desc_fr,
        product.short_desc_ar,
        product.description_fr,
        product.description_ar,
        product.price,
        product.sale_price,
        product.stock,
        JSON.stringify(product.images),
        JSON.stringify(product.variations),
        product.is_visible ? 1 : 0,
        product.is_featured ? 1 : 0,
        product.is_bestseller ? 1 : 0,
        product.is_new_arrival ? 1 : 0,
        now,
        now
      );
    return product;
  }

  public async updateProduct(id: string, patch: Partial<Product>): Promise<Product | null> {
    const existing = await this.getProductById(id);
    if (!existing) return null;
    const now = new Date().toISOString();

    const updated: Product = {
      ...existing,
      ...patch,
      id: existing.id,
      slug: patch.slug ? sanitizeSlug(patch.slug) || existing.slug : existing.slug,
      updated_at: now,
    };

    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch<Array<Record<string, unknown>>>(
        `products?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            slug: updated.slug,
            category_slug: updated.category_slug,
            name_fr: updated.name_fr,
            name_ar: updated.name_ar,
            short_desc_fr: updated.short_desc_fr,
            short_desc_ar: updated.short_desc_ar,
            description_fr: updated.description_fr,
            description_ar: updated.description_ar,
            price: updated.price,
            sale_price: updated.sale_price,
            stock: updated.stock,
            images: updated.images,
            variations: updated.variations,
            is_visible: updated.is_visible,
            is_featured: updated.is_featured,
            is_bestseller: updated.is_bestseller,
            is_new_arrival: updated.is_new_arrival,
            updated_at: now,
          }),
        }
      );
      if (res.ok && res.data?.[0]) {
        return this.mapSupabaseProduct(res.data[0]);
      }
    }

    this.sqlite
      .prepare(
        `UPDATE products SET
          slug = ?, category_slug = ?, name_fr = ?, name_ar = ?,
          short_desc_fr = ?, short_desc_ar = ?, description_fr = ?, description_ar = ?,
          price = ?, sale_price = ?, stock = ?, images = ?, variations = ?,
          is_visible = ?, is_featured = ?, is_bestseller = ?, is_new_arrival = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        updated.slug,
        updated.category_slug,
        updated.name_fr,
        updated.name_ar,
        updated.short_desc_fr,
        updated.short_desc_ar,
        updated.description_fr,
        updated.description_ar,
        updated.price,
        updated.sale_price,
        updated.stock,
        JSON.stringify(updated.images),
        JSON.stringify(updated.variations),
        updated.is_visible ? 1 : 0,
        updated.is_featured ? 1 : 0,
        updated.is_bestseller ? 1 : 0,
        updated.is_new_arrival ? 1 : 0,
        now,
        id
      );

    return updated;
  }

  public async deleteProduct(id: string): Promise<boolean> {
    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch(`products?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) return true;
    }
    const info = this.sqlite.prepare('DELETE FROM products WHERE id = ?').run(id);
    return info.changes > 0;
  }

  public async createOrder(input: CreateOrderInput): Promise<{ order: Order } | { error: string; status: number }> {
    const settings = await this.getSettings();
    const allProducts = await this.getProducts(false);
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    // Aggregate requested quantities per product to verify stock accurately
    const requestedQtyByProduct = new Map<string, number>();
    const resolvedItems: Array<{
      product: Product;
      variation: ProductVariation | null;
      unit_price: number;
      quantity: number;
      line_total: number;
    }> = [];

    for (const item of input.items) {
      const prod = productMap.get(item.product_id);
      if (!prod) {
        return { error: 'Un produit du panier est introuvable ou indisponible.', status: 400 };
      }
      const qty = Math.floor(Number(item.quantity));
      if (!Number.isFinite(qty) || qty < 1 || qty > 20) {
        return { error: 'Quantité invalide pour un article du panier.', status: 400 };
      }
      const prevTotal = requestedQtyByProduct.get(prod.id) || 0;
      if (prevTotal + qty > prod.stock) {
        return {
          error: `Stock insuffisant pour « ${prod.name_fr} » (${prod.stock} disponible(s)).`,
          status: 409,
        };
      }
      requestedQtyByProduct.set(prod.id, prevTotal + qty);

      let variation: ProductVariation | null = null;
      if (item.variation_id) {
        variation = prod.variations.find((v) => v.id === item.variation_id) || null;
      }

      const basePrice = prod.sale_price !== null && prod.sale_price < prod.price ? prod.sale_price : prod.price;
      const unitPrice = Math.max(0, Number((basePrice + (variation?.price_delta || 0)).toFixed(2)));
      const lineTotal = Number((unitPrice * qty).toFixed(2));

      resolvedItems.push({
        product: prod,
        variation,
        unit_price: unitPrice,
        quantity: qty,
        line_total: lineTotal,
      });
    }

    if (resolvedItems.length === 0) {
      return { error: 'Le panier est vide.', status: 400 };
    }

    const subtotal = Number(
      resolvedItems.reduce((sum, item) => sum + item.line_total, 0).toFixed(2)
    );
    const shippingFee =
      subtotal >= settings.free_shipping_threshold ? 0 : Number(settings.shipping_fee || 0);
    const total = Number((subtotal + shippingFee).toFixed(2));

    const orderId = `ord-${crypto.randomBytes(6).toString('hex')}`;
    const orderNumber = `MXP-${crypto.randomInt(100000, 999999)}`;
    const now = new Date().toISOString();

    const order: Order = {
      id: orderId,
      order_number: orderNumber,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone,
      city: input.city,
      address: input.address,
      note: input.note,
      status: 'En attente',
      subtotal,
      shipping_fee: shippingFee,
      total,
      payment_method: 'COD',
      language: input.language,
      created_at: now,
      updated_at: now,
    };

    const orderItems: OrderItem[] = resolvedItems.map((entry) => ({
      id: `oi-${crypto.randomBytes(6).toString('hex')}`,
      order_id: orderId,
      product_id: entry.product.id,
      product_slug: entry.product.slug,
      product_name_fr: entry.product.name_fr,
      product_name_ar: entry.product.name_ar,
      variation_label_fr: entry.variation?.label_fr || '',
      variation_label_ar: entry.variation?.label_ar || '',
      unit_price: entry.unit_price,
      quantity: entry.quantity,
      line_total: entry.line_total,
    }));

    if (this.activeMode === 'supabase') {
      const orderRes = await this.supabaseFetch('orders', {
        method: 'POST',
        body: JSON.stringify([order]),
      });
      if (orderRes.ok) {
        await this.supabaseFetch('order_items', {
          method: 'POST',
          body: JSON.stringify(orderItems),
        });
        for (const [prodId, qtyUsed] of requestedQtyByProduct.entries()) {
          const prod = productMap.get(prodId)!;
          await this.supabaseFetch(`products?id=eq.${encodeURIComponent(prodId)}`, {
            method: 'PATCH',
            body: JSON.stringify({
              stock: Math.max(0, prod.stock - qtyUsed),
              sales_count: (prod.sales_count || 0) + qtyUsed,
              updated_at: now,
            }),
          });
        }
        return { order: { ...order, items: orderItems } };
      }
    }

    // SQLite atomic transaction with conditional stock check
    const tx = this.sqlite.transaction(() => {
      for (const [prodId, qtyUsed] of requestedQtyByProduct.entries()) {
        const res = this.sqlite
          .prepare(
            `UPDATE products SET stock = stock - ?, sales_count = sales_count + ?, updated_at = ?
             WHERE id = ? AND stock >= ?`
          )
          .run(qtyUsed, qtyUsed, now, prodId, qtyUsed);
        if (res.changes === 0) {
          throw new Error('INSUFFICIENT_STOCK');
        }
      }

      this.sqlite
        .prepare(
          `INSERT INTO orders (
            id, order_number, customer_name, customer_phone, city, address, note,
            status, subtotal, shipping_fee, total, payment_method, language, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          order.id,
          order.order_number,
          order.customer_name,
          order.customer_phone,
          order.city,
          order.address,
          order.note,
          order.status,
          order.subtotal,
          order.shipping_fee,
          order.total,
          order.payment_method,
          order.language,
          order.created_at,
          order.updated_at
        );

      const insertItem = this.sqlite.prepare(
        `INSERT INTO order_items (
          id, order_id, product_id, product_slug, product_name_fr, product_name_ar,
          variation_label_fr, variation_label_ar, unit_price, quantity, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const oi of orderItems) {
        insertItem.run(
          oi.id,
          oi.order_id,
          oi.product_id,
          oi.product_slug,
          oi.product_name_fr,
          oi.product_name_ar,
          oi.variation_label_fr,
          oi.variation_label_ar,
          oi.unit_price,
          oi.quantity,
          oi.line_total
        );
      }
    });

    try {
      tx();
    } catch (err) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_STOCK') {
        return { error: 'Stock insuffisant lors de la validation de la commande.', status: 409 };
      }
      throw err;
    }

    return { order: { ...order, items: orderItems } };
  }

  public async getOrderByNumber(orderNumber: string): Promise<Order | null> {
    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch<Order[]>(
        `orders?order_number=eq.${encodeURIComponent(orderNumber)}&select=*&limit=1`
      );
      if (res.ok && res.data?.[0]) {
        const order = res.data[0];
        const itemsRes = await this.supabaseFetch<OrderItem[]>(
          `order_items?order_id=eq.${encodeURIComponent(order.id)}&select=*`
        );
        return {
          ...order,
          subtotal: Number(order.subtotal),
          shipping_fee: Number(order.shipping_fee),
          total: Number(order.total),
          items: (itemsRes.data || []).map((i) => ({
            ...i,
            unit_price: Number(i.unit_price),
            quantity: Number(i.quantity),
            line_total: Number(i.line_total),
          })),
        };
      }
    }

    const row = this.sqlite
      .prepare('SELECT * FROM orders WHERE order_number = ? LIMIT 1')
      .get(orderNumber) as Record<string, unknown> | undefined;
    if (!row) return null;
    const items = this.sqlite
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .all(String(row.id)) as Array<Record<string, unknown>>;

    return {
      id: String(row.id),
      order_number: String(row.order_number),
      customer_name: String(row.customer_name),
      customer_phone: String(row.customer_phone),
      city: String(row.city),
      address: String(row.address),
      note: String(row.note || ''),
      status: String(row.status) as OrderStatus,
      subtotal: Number(row.subtotal),
      shipping_fee: Number(row.shipping_fee),
      total: Number(row.total),
      payment_method: String(row.payment_method),
      language: (String(row.language) === 'ar' ? 'ar' : 'fr') as Language,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at || ''),
      items: items.map((i) => ({
        id: String(i.id),
        order_id: String(i.order_id),
        product_id: String(i.product_id),
        product_slug: String(i.product_slug),
        product_name_fr: String(i.product_name_fr),
        product_name_ar: String(i.product_name_ar),
        variation_label_fr: String(i.variation_label_fr || ''),
        variation_label_ar: String(i.variation_label_ar || ''),
        unit_price: Number(i.unit_price),
        quantity: Number(i.quantity),
        line_total: Number(i.line_total),
      })),
    };
  }

  public async getOrders(): Promise<Order[]> {
    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch<Order[]>('orders?select=*&order=created_at.desc');
      const itemsRes = await this.supabaseFetch<OrderItem[]>('order_items?select=*');
      if (res.ok && res.data) {
        const itemsByOrder = new Map<string, OrderItem[]>();
        for (const item of itemsRes.data || []) {
          const list = itemsByOrder.get(item.order_id) || [];
          list.push({
            ...item,
            unit_price: Number(item.unit_price),
            quantity: Number(item.quantity),
            line_total: Number(item.line_total),
          });
          itemsByOrder.set(item.order_id, list);
        }
        return res.data.map((o) => ({
          ...o,
          subtotal: Number(o.subtotal),
          shipping_fee: Number(o.shipping_fee),
          total: Number(o.total),
          items: itemsByOrder.get(o.id) || [],
        }));
      }
    }

    const orderRows = this.sqlite
      .prepare('SELECT * FROM orders ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;
    const itemRows = this.sqlite.prepare('SELECT * FROM order_items').all() as Array<
      Record<string, unknown>
    >;

    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const i of itemRows) {
      const oid = String(i.order_id);
      const list = itemsByOrder.get(oid) || [];
      list.push({
        id: String(i.id),
        order_id: oid,
        product_id: String(i.product_id),
        product_slug: String(i.product_slug),
        product_name_fr: String(i.product_name_fr),
        product_name_ar: String(i.product_name_ar),
        variation_label_fr: String(i.variation_label_fr || ''),
        variation_label_ar: String(i.variation_label_ar || ''),
        unit_price: Number(i.unit_price),
        quantity: Number(i.quantity),
        line_total: Number(i.line_total),
      });
      itemsByOrder.set(oid, list);
    }

    return orderRows.map((row) => ({
      id: String(row.id),
      order_number: String(row.order_number),
      customer_name: String(row.customer_name),
      customer_phone: String(row.customer_phone),
      city: String(row.city),
      address: String(row.address),
      note: String(row.note || ''),
      status: String(row.status) as OrderStatus,
      subtotal: Number(row.subtotal),
      shipping_fee: Number(row.shipping_fee),
      total: Number(row.total),
      payment_method: String(row.payment_method),
      language: (String(row.language) === 'ar' ? 'ar' : 'fr') as Language,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at || ''),
      items: itemsByOrder.get(String(row.id)) || [],
    }));
  }

  public async updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
    const now = new Date().toISOString();
    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch<Order[]>(
        `orders?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ status, updated_at: now }),
        }
      );
      if (res.ok && res.data?.[0]) {
        return res.data[0];
      }
    }
    const info = this.sqlite
      .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, id);
    if (info.changes === 0) return null;
    const row = this.sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Record<
      string,
      unknown
    >;
    return {
      id: String(row.id),
      order_number: String(row.order_number),
      customer_name: String(row.customer_name),
      customer_phone: String(row.customer_phone),
      city: String(row.city),
      address: String(row.address),
      note: String(row.note || ''),
      status: String(row.status) as OrderStatus,
      subtotal: Number(row.subtotal),
      shipping_fee: Number(row.shipping_fee),
      total: Number(row.total),
      payment_method: String(row.payment_method),
      language: (String(row.language) === 'ar' ? 'ar' : 'fr') as Language,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at || ''),
    };
  }

  public async getAdminOverview(): Promise<AdminOverviewStats> {
    const orders = await this.getOrders();
    const products = await this.getProducts(true);

    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();
    const weekMs = now - 7 * 24 * 60 * 60 * 1000;
    const monthMs = now - 30 * 24 * 60 * 60 * 1000;

    let revenueToday = 0;
    let revenueWeek = 0;
    let revenueMonth = 0;
    let revenueTotal = 0;

    const ordersByStatus = ORDER_STATUSES.reduce((acc, st) => {
      acc[st] = 0;
      return acc;
    }, {} as Record<OrderStatus, number>);

    for (const order of orders) {
      if (ordersByStatus[order.status] !== undefined) {
        ordersByStatus[order.status] += 1;
      }
      if (order.status !== 'Annulée') {
        const ts = new Date(order.created_at).getTime();
        revenueTotal += order.total;
        if (ts >= todayMs) revenueToday += order.total;
        if (ts >= weekMs) revenueWeek += order.total;
        if (ts >= monthMs) revenueMonth += order.total;
      }
    }

    const lowStockProducts = products.filter((p) => p.stock <= 5).sort((a, b) => a.stock - b.stock);

    return {
      revenue_today: Number(revenueToday.toFixed(2)),
      revenue_week: Number(revenueWeek.toFixed(2)),
      revenue_month: Number(revenueMonth.toFixed(2)),
      revenue_total: Number(revenueTotal.toFixed(2)),
      orders_total: orders.length,
      orders_by_status: ordersByStatus,
      low_stock_products: lowStockProducts,
      storage_mode: this.activeMode,
      supabase_configured: this.isSupabaseConfigured(),
      supabase_error: this.supabaseError || undefined,
    };
  }

  // Admin auth persistence
  public async getAdminAuthRecord(): Promise<AdminAuthRecord | null> {
    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch<AdminAuthRecord[]>(
        'admin_auth?id=eq.primary&select=id,password_hash,password_salt&limit=1'
      );
      if (res.ok && res.data?.[0]) {
        return res.data[0];
      }
    }
    const row = this.sqlite
      .prepare('SELECT id, password_hash, password_salt FROM admin_auth WHERE id = ? LIMIT 1')
      .get('primary') as AdminAuthRecord | undefined;
    return row || null;
  }

  public async createAdminAuthRecord(passwordHash: string, passwordSalt: string): Promise<boolean> {
    const existing = await this.getAdminAuthRecord();
    if (existing) return false;
    const now = new Date().toISOString();

    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch('admin_auth', {
        method: 'POST',
        body: JSON.stringify([
          {
            id: 'primary',
            password_hash: passwordHash,
            password_salt: passwordSalt,
            created_at: now,
            updated_at: now,
          },
        ]),
      });
      if (res.ok) return true;
    }

    const info = this.sqlite
      .prepare(
        `INSERT OR IGNORE INTO admin_auth (id, password_hash, password_salt, created_at, updated_at)
         VALUES ('primary', ?, ?, ?, ?)`
      )
      .run(passwordHash, passwordSalt, now, now);
    return info.changes > 0;
  }

  // Brute-force IP lock tracking (3 attempts -> 15-minute ban)
  public async getLoginAttemptStatus(ip: string): Promise<{
    locked: boolean;
    remainingSeconds: number;
    attempts: number;
    attemptsRemaining: number;
  }> {
    let rec: LoginAttemptRecord | null = null;
    if (this.activeMode === 'supabase') {
      const res = await this.supabaseFetch<LoginAttemptRecord[]>(
        `admin_login_attempts?ip=eq.${encodeURIComponent(ip)}&select=*&limit=1`
      );
      if (res.ok && res.data?.[0]) rec = res.data[0];
    } else {
      rec =
        (this.sqlite
          .prepare('SELECT * FROM admin_login_attempts WHERE ip = ? LIMIT 1')
          .get(ip) as LoginAttemptRecord | undefined) || null;
    }

    if (!rec) {
      return { locked: false, remainingSeconds: 0, attempts: 0, attemptsRemaining: 3 };
    }

    if (rec.locked_until) {
      const lockExpiry = new Date(rec.locked_until).getTime();
      const now = Date.now();
      if (lockExpiry > now) {
        return {
          locked: true,
          remainingSeconds: Math.ceil((lockExpiry - now) / 1000),
          attempts: rec.attempts,
          attemptsRemaining: 0,
        };
      }
      // Lock expired — reset
      await this.resetLoginAttempts(ip);
      return { locked: false, remainingSeconds: 0, attempts: 0, attemptsRemaining: 3 };
    }

    return {
      locked: false,
      remainingSeconds: 0,
      attempts: rec.attempts,
      attemptsRemaining: Math.max(0, 3 - rec.attempts),
    };
  }

  public async recordFailedLoginAttempt(ip: string): Promise<{
    locked: boolean;
    remainingSeconds: number;
    attempts: number;
    attemptsRemaining: number;
  }> {
    const current = await this.getLoginAttemptStatus(ip);
    if (current.locked) return current;

    const nextAttempts = current.attempts + 1;
    const isNowLocked = nextAttempts >= 3;
    const lockDurationMs = 15 * 60 * 1000;
    const lockedUntil = isNowLocked ? new Date(Date.now() + lockDurationMs).toISOString() : null;
    const now = new Date().toISOString();

    if (this.activeMode === 'supabase') {
      await this.supabaseFetch('admin_login_attempts?on_conflict=ip', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([
          {
            ip,
            attempts: nextAttempts,
            locked_until: lockedUntil,
            last_attempt_at: now,
          },
        ]),
      });
    } else {
      this.sqlite
        .prepare(
          `INSERT INTO admin_login_attempts (ip, attempts, locked_until, last_attempt_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(ip) DO UPDATE SET
             attempts = excluded.attempts,
             locked_until = excluded.locked_until,
             last_attempt_at = excluded.last_attempt_at`
        )
        .run(ip, nextAttempts, lockedUntil, now);
    }

    return {
      locked: isNowLocked,
      remainingSeconds: isNowLocked ? 15 * 60 : 0,
      attempts: nextAttempts,
      attemptsRemaining: Math.max(0, 3 - nextAttempts),
    };
  }

  public async resetLoginAttempts(ip: string): Promise<void> {
    if (this.activeMode === 'supabase') {
      await this.supabaseFetch(`admin_login_attempts?ip=eq.${encodeURIComponent(ip)}`, {
        method: 'DELETE',
      });
      return;
    }
    this.sqlite.prepare('DELETE FROM admin_login_attempts WHERE ip = ?').run(ip);
  }

  // Media upload to Supabase Storage (with auto-create public bucket) or confined local uploads/
  public async uploadMedia(
    buffer: Buffer,
    format: SupportedImageFormat
  ): Promise<{ url: string; storage: 'supabase' | 'local' }> {
    const filename = `maxpro-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${format.ext}`;

    if (this.activeMode === 'supabase' && this.isSupabaseConfigured()) {
      try {
        // Ensure public bucket exists
        const bucketCheck = await fetch(
          `${this.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(this.storageBucket)}`,
          {
            headers: {
              apikey: this.supabaseKey,
              Authorization: `Bearer ${this.supabaseKey}`,
            },
          }
        );

        if (bucketCheck.status === 404 || bucketCheck.status === 400) {
          await fetch(`${this.supabaseUrl}/storage/v1/bucket`, {
            method: 'POST',
            headers: {
              apikey: this.supabaseKey,
              Authorization: `Bearer ${this.supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: this.storageBucket,
              name: this.storageBucket,
              public: true,
              file_size_limit: 5 * 1024 * 1024,
              allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
            }),
          });
        }

        const uploadRes = await fetch(
          `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(this.storageBucket)}/${encodeURIComponent(filename)}`,
          {
            method: 'POST',
            headers: {
              apikey: this.supabaseKey,
              Authorization: `Bearer ${this.supabaseKey}`,
              'Content-Type': format.mime,
              'x-upsert': 'true',
            },
            body: new Uint8Array(buffer),
          }
        );

        if (uploadRes.ok) {
          return {
            url: `${this.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(this.storageBucket)}/${encodeURIComponent(filename)}`,
            storage: 'supabase',
          };
        }
      } catch {
        // Fall through to safe local storage
      }
    }

    const confinedPath = resolveConfinedPath(this.uploadsDir, filename);
    if (!confinedPath) {
      throw new Error('Nom de fichier invalide.');
    }
    fs.writeFileSync(confinedPath, buffer);
    return {
      url: `/uploads/${filename}`,
      storage: 'local',
    };
  }
}

export const storeDb = new StoreDatabase();
