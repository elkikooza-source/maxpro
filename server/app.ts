import 'dotenv/config';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import type { OrderStatus, Product, ProductVariation, SiteSettings } from '../src/types/store.js';
import { ORDER_STATUSES } from '../src/types/store.js';
import { storeDb } from './db.js';
import { presenceTracker } from './presence.js';
import {
  checkOrderRateLimit,
  createAdminToken,
  detectImageMagicBytes,
  getClientIp,
  hashPassword,
  isSafeUrl,
  resolveConfinedPath,
  verifyAdminToken,
  verifyEnvPasscode,
  verifyPassword,
} from './security.js';

let initPromise: Promise<void> | null = null;

export async function ensureDbInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = storeDb
      .initializeAndVerify()
      .then((dbStatus) => {
        console.log(
          `[maxPro] Database mode: ${dbStatus.mode}${dbStatus.error ? ` (${dbStatus.error})` : ''}`
        );
      })
      .catch((err) => {
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
}

export function createApiApp(): Express {
  const app = express();
  app.set('trust proxy', 1);

  // Strict security headers (iframe-compatible for AI Studio preview)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(express.json({ limit: '8mb' }));

  // Ensure DB initialization has completed before handling API calls (serverless-safe)
  app.use('/api', async (_req, _res, next) => {
    try {
      await ensureDbInitialized();
      next();
    } catch (err) {
      next(err);
    }
  });

  // Serve locally uploaded images with path confinement and strict sandbox CSP
  app.get('/uploads/:filename', (req, res) => {
    const confined = resolveConfinedPath(storeDb.getUploadsDir(), req.params.filename);
    if (!confined || !fs.existsSync(confined)) {
      return res.status(404).json({ error: 'Fichier introuvable.' });
    }
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(confined);
  });

  // Public Health & Storefront Endpoints
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: storeDb.getStatus().mode });
  });

  // Public anonymous storefront visitor heartbeat (never returns counts)
  const parsePresenceBody = (req: Request): { visitorId?: unknown; path?: unknown } => {
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return req.body && typeof req.body === 'object' ? req.body : {};
  };

  app.post('/api/presence/ping', express.text({ type: 'text/plain', limit: '4kb' }), (req, res) => {
    const body = parsePresenceBody(req);
    const ip = getClientIp(req);
    presenceTracker.ping(body.visitorId, ip, body.path);
    return res.status(204).end();
  });

  app.post('/api/presence/leave', express.text({ type: 'text/plain', limit: '4kb' }), (req, res) => {
    const body = parsePresenceBody(req);
    presenceTracker.leave(body.visitorId);
    return res.status(204).end();
  });

  app.get('/api/storefront', async (_req, res) => {
    try {
      const [settings, categories, products] = await Promise.all([
        storeDb.getSettings(),
        storeDb.getCategories(true),
        storeDb.getProducts(false),
      ]);
      res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=60');
      res.json({ settings, categories, products });
    } catch (err) {
      console.error('Storefront error:', err);
      res.status(500).json({ error: 'Impossible de charger la boutique.' });
    }
  });

  app.get('/api/products', async (req, res) => {
    try {
      let products = await storeDb.getProducts(false);
      const { category, search, minPrice, maxPrice, sort, bestseller, newArrival, featured } =
        req.query;

      if (typeof category === 'string' && category && category !== 'all') {
        products = products.filter((p) => p.category_slug === category);
      }
      if (typeof search === 'string' && search.trim()) {
        const q = search.trim().toLowerCase();
        products = products.filter(
          (p) =>
            p.name_fr.toLowerCase().includes(q) ||
            p.name_ar.toLowerCase().includes(q) ||
            p.short_desc_fr.toLowerCase().includes(q) ||
            p.short_desc_ar.toLowerCase().includes(q)
        );
      }
      if (typeof minPrice === 'string' && minPrice !== '') {
        const min = Number(minPrice);
        if (Number.isFinite(min)) {
          products = products.filter((p) => (p.sale_price ?? p.price) >= min);
        }
      }
      if (typeof maxPrice === 'string' && maxPrice !== '') {
        const max = Number(maxPrice);
        if (Number.isFinite(max)) {
          products = products.filter((p) => (p.sale_price ?? p.price) <= max);
        }
      }
      if (bestseller === 'true') {
        products = products.filter((p) => p.is_bestseller);
      }
      if (newArrival === 'true') {
        products = products.filter((p) => p.is_new_arrival);
      }
      if (featured === 'true') {
        products = products.filter((p) => p.is_featured);
      }

      if (sort === 'price_asc') {
        products.sort((a, b) => (a.sale_price ?? a.price) - (b.sale_price ?? b.price));
      } else if (sort === 'price_desc') {
        products.sort((a, b) => (b.sale_price ?? b.price) - (a.sale_price ?? a.price));
      } else if (sort === 'bestsellers') {
        products.sort((a, b) => b.sales_count - a.sales_count);
      } else if (sort === 'newest') {
        products.sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
      } else {
        products.sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
      }

      res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=60');
      res.json({ products });
    } catch (err) {
      console.error('Products list error:', err);
      res.status(500).json({ error: 'Erreur lors du chargement des produits.' });
    }
  });

  app.get('/api/products/:slug', async (req, res) => {
    try {
      const product = await storeDb.getProductBySlug(req.params.slug, false);
      if (!product) {
        return res.status(404).json({ error: 'Produit introuvable.' });
      }
      const all = await storeDb.getProducts(false);
      const related = all
        .filter((p) => p.id !== product.id && p.category_slug === product.category_slug)
        .slice(0, 3);
      if (related.length < 3) {
        const extras = all.filter(
          (p) => p.id !== product.id && !related.some((r) => r.id === p.id)
        );
        related.push(...extras.slice(0, 3 - related.length));
      }
      res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=60');
      return res.json({ product, related });
    } catch (err) {
      console.error('Product detail error:', err);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
  });

  app.post('/api/orders', async (req, res) => {
    const ip = getClientIp(req);
    const rate = checkOrderRateLimit(ip);
    if (!rate.allowed) {
      return res.status(429).json({
        error: `Trop de commandes envoyées. Veuillez réessayer dans ${rate.retryAfterSeconds}s.`,
      });
    }

    const body = req.body || {};
    const customer_name = String(body.customer_name || '').trim();
    const customer_phone = String(body.customer_phone || '').trim();
    const city = String(body.city || '').trim();
    const address = String(body.address || '').trim();
    const note = String(body.note || '').trim().slice(0, 500);
    const language = body.language === 'ar' ? 'ar' : 'fr';
    const items = Array.isArray(body.items) ? body.items : [];

    if (customer_name.length < 2 || customer_name.length > 100) {
      return res.status(400).json({ error: 'Nom complet invalide.' });
    }
    if (!/^[+\d\s()-]{8,24}$/.test(customer_phone)) {
      return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    }
    if (city.length < 2 || city.length > 80) {
      return res.status(400).json({ error: 'Ville invalide.' });
    }
    if (address.length < 5 || address.length > 250) {
      return res.status(400).json({ error: 'Adresse complète requise.' });
    }
    if (items.length === 0 || items.length > 30) {
      return res.status(400).json({ error: 'Panier invalide.' });
    }

    try {
      const result = await storeDb.createOrder({
        customer_name,
        customer_phone,
        city,
        address,
        note,
        language,
        items: items.map((item: Record<string, unknown>) => ({
          product_id: String(item.product_id || ''),
          variation_id: item.variation_id ? String(item.variation_id) : null,
          quantity: Number(item.quantity || 1),
        })),
      });

      if ('error' in result) {
        return res.status(result.status).json({ error: result.error });
      }
      return res.status(201).json({ order: result.order });
    } catch (err) {
      console.error('Order creation error:', err);
      return res.status(500).json({ error: 'Erreur lors de l’enregistrement de la commande.' });
    }
  });

  app.get('/api/orders/:orderNumber', async (req, res) => {
    const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();
    if (!/^MXP-\d{6}$/.test(orderNumber)) {
      return res.status(400).json({ error: 'Numéro de commande invalide.' });
    }
    try {
      const order = await storeDb.getOrderByNumber(orderNumber);
      if (!order) {
        return res.status(404).json({ error: 'Commande introuvable.' });
      }
      return res.json({ order });
    } catch (err) {
      console.error('Fetch order error:', err);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
  });

  // -------------------------------------------------------------------------
  // Admin Authentication (HttpOnly Cookie + CSRF + Scoped Backoff)
  // -------------------------------------------------------------------------
  const ADMIN_COOKIE_NAME = 'maxpro_admin_session';

  const parseCookieValue = (cookieHeader: string | undefined, name: string): string | null => {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      if (key === name) {
        try {
          return decodeURIComponent(part.slice(idx + 1).trim());
        } catch {
          return part.slice(idx + 1).trim();
        }
      }
    }
    return null;
  };

  const extractAdminToken = (req: Request): string | null => {
    return parseCookieValue(req.headers.cookie, ADMIN_COOKIE_NAME);
  };

  const setAdminSessionCookie = (req: Request, res: Response, token: string, maxAgeSeconds = 12 * 60 * 60) => {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const isCrossSiteIframe = req.headers['sec-fetch-site'] === 'cross-site';
    const parts = [
      `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
      'Path=/',
      `Max-Age=${maxAgeSeconds}`,
      'HttpOnly',
    ];
    if (isHttps && isCrossSiteIframe) {
      parts.push('SameSite=None', 'Secure', 'Partitioned');
    } else if (isHttps) {
      parts.push('SameSite=Lax', 'Secure');
    } else {
      parts.push('SameSite=Lax');
    }
    res.setHeader('Set-Cookie', parts.join('; '));
  };

  const clearAdminSessionCookie = (req: Request, res: Response) => {
    setAdminSessionCookie(req, res, '', 0);
  };

  const requireAdminCsrf = (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    if (req.headers['x-requested-with'] !== 'maxpro-admin') {
      return res.status(403).json({ error: 'En-tête CSRF requis manquant.' });
    }
    return next();
  };

  app.use('/api/admin', requireAdminCsrf);

  app.get('/api/admin/auth/status', async (req, res) => {
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const envUsername = (process.env.ADMIN_USERNAME || 'admin').trim() || 'admin';
    const envManaged = envPasscode.length > 0;
    const requiresSetupKey = (process.env.ADMIN_SETUP_KEY || '').trim().length > 0;

    const authRec = envManaged ? null : await storeDb.getAdminAuthRecord();
    const token = extractAdminToken(req);
    const authenticated = verifyAdminToken(token);

    res.json({
      needsSetup: !envManaged && !authRec,
      envManaged,
      requiresSetupKey,
      authenticated,
      ...(authenticated
        ? { username: envManaged ? envUsername : authRec?.username || 'admin' }
        : {}),
    });
  });

  app.post('/api/admin/auth/setup', async (req, res) => {
    const ip = getClientIp(req);
    const attemptStatus = await storeDb.getLoginAttemptStatus(ip, '_setup');
    if (attemptStatus.locked) {
      return res.status(429).json({
        error: 'Trop de tentatives. Veuillez patienter avant de réessayer.',
        locked: true,
        remainingSeconds: attemptStatus.remainingSeconds,
      });
    }

    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    if (envPasscode.length > 0) {
      return res.status(403).json({
        error: 'Le mot de passe administrateur est déjà défini via les variables d’environnement.',
      });
    }

    const expectedSetupKey = (process.env.ADMIN_SETUP_KEY || '').trim();
    if (expectedSetupKey.length > 0) {
      const providedKey = String(req.body?.setupKey || '');
      if (!verifyEnvPasscode(providedKey, expectedSetupKey)) {
        const updated = await storeDb.recordFailedLoginAttempt(ip, '_setup');
        return res.status(updated.locked ? 429 : 403).json({
          error: updated.locked
            ? 'Trop de tentatives. Veuillez patienter avant de réessayer.'
            : 'Clé de configuration invalide.',
          locked: updated.locked,
          remainingSeconds: updated.remainingSeconds,
        });
      }
    }

    const existing = await storeDb.getAdminAuthRecord();
    if (existing) {
      return res.status(409).json({ error: 'Le compte administrateur est déjà configuré.' });
    }

    const username = String(req.body?.username || req.body?.login || '').trim();
    const password = String(req.body?.password || '');
    if (username.length < 3 || username.length > 64) {
      return res.status(400).json({
        error: 'L’identifiant doit contenir entre 3 et 64 caractères.',
      });
    }
    if (password.length < 12 || password.length > 128) {
      return res.status(400).json({
        error: 'Le mot de passe doit contenir au moins 12 caractères.',
      });
    }

    const { hash, salt } = hashPassword(password);
    const created = await storeDb.createAdminAuthRecord(username, hash, salt);
    if (!created) {
      return res.status(409).json({ error: 'Le compte administrateur est déjà configuré.' });
    }

    await storeDb.resetLoginAttempts(ip, '_setup');
    await storeDb.resetLoginAttempts(ip, username);
    const token = createAdminToken();
    setAdminSessionCookie(req, res, token);
    return res.status(201).json({ ok: true, authenticated: true });
  });

  app.post('/api/admin/auth/login', async (req, res) => {
    const ip = getClientIp(req);
    const username = String(req.body?.username || req.body?.login || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      return res.status(400).json({ error: 'Veuillez saisir votre identifiant et mot de passe.' });
    }

    const attemptStatus = await storeDb.getLoginAttemptStatus(ip, username);
    if (attemptStatus.locked) {
      return res.status(429).json({
        error: 'Trop de tentatives échouées. Veuillez patienter avant de réessayer.',
        locked: true,
        remainingSeconds: attemptStatus.remainingSeconds,
      });
    }

    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const envUsername = (process.env.ADMIN_USERNAME || 'admin').trim() || 'admin';
    let valid = false;

    if (envPasscode.length > 0) {
      const userMatch = verifyEnvPasscode(username, envUsername);
      const passMatch = verifyEnvPasscode(password, envPasscode);
      valid = userMatch && passMatch;
    } else {
      const rec = await storeDb.getAdminAuthRecord();
      if (!rec) {
        return res.status(400).json({ error: 'Configuration initiale requise.' });
      }
      const userMatch = verifyEnvPasscode(username, rec.username || 'admin');
      const passMatch = verifyPassword(password, rec.password_hash, rec.password_salt);
      valid = userMatch && passMatch;
    }

    if (!valid) {
      const updated = await storeDb.recordFailedLoginAttempt(ip, username);
      return res.status(updated.locked ? 429 : 401).json({
        error: updated.locked
          ? 'Trop de tentatives échouées. Veuillez patienter avant de réessayer.'
          : 'Identifiant ou mot de passe incorrect.',
        locked: updated.locked,
        remainingSeconds: updated.remainingSeconds,
      });
    }

    await storeDb.resetLoginAttempts(ip, username);
    const token = createAdminToken();
    setAdminSessionCookie(req, res, token);
    return res.json({ ok: true, authenticated: true });
  });

  app.post('/api/admin/auth/logout', (req, res) => {
    clearAdminSessionCookie(req, res);
    return res.json({ ok: true });
  });

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const token = extractAdminToken(req);
    if (!verifyAdminToken(token)) {
      return res.status(401).json({ error: 'Session administrateur expirée ou invalide.' });
    }
    return next();
  };

  app.post('/api/admin/auth/change-password', requireAdmin, async (req, res) => {
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    if (envPasscode.length > 0) {
      return res.status(400).json({
        error: 'Le mot de passe est géré via les variables d’environnement du serveur (ADMIN_PASSCODE).',
      });
    }

    const ip = getClientIp(req);
    const attemptStatus = await storeDb.getLoginAttemptStatus(ip, '_pwchange');
    if (attemptStatus.locked) {
      return res.status(429).json({
        error: `Trop de tentatives. Réessayez dans ${attemptStatus.remainingSeconds}s.`,
      });
    }

    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const newUsernameRaw =
      typeof req.body?.newUsername === 'string' ? req.body.newUsername.trim() : '';

    if (!currentPassword) {
      return res.status(400).json({ error: 'Veuillez saisir votre mot de passe actuel.' });
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      return res.status(400).json({
        error: 'Le nouveau mot de passe doit contenir au moins 12 caractères.',
      });
    }
    if (newUsernameRaw && (newUsernameRaw.length < 3 || newUsernameRaw.length > 64)) {
      return res.status(400).json({
        error: 'Le nouvel identifiant doit contenir entre 3 et 64 caractères.',
      });
    }

    const rec = await storeDb.getAdminAuthRecord();
    if (!rec) {
      return res.status(400).json({ error: 'Compte administrateur introuvable.' });
    }

    if (!verifyPassword(currentPassword, rec.password_hash, rec.password_salt)) {
      const updated = await storeDb.recordFailedLoginAttempt(ip, '_pwchange');
      return res.status(updated.locked ? 429 : 401).json({
        error: updated.locked
          ? `Trop de tentatives. Réessayez dans ${updated.remainingSeconds}s.`
          : 'Mot de passe actuel incorrect.',
      });
    }

    const nextUsername = newUsernameRaw || rec.username || 'admin';
    const { hash, salt } = hashPassword(newPassword);
    const updatedOk = await storeDb.updateAdminCredentials(nextUsername, hash, salt);
    if (!updatedOk) {
      return res.status(500).json({ error: 'Impossible de mettre à jour le mot de passe.' });
    }

    await storeDb.resetLoginAttempts(ip, '_pwchange');
    const rotatedToken = createAdminToken();
    setAdminSessionCookie(req, res, rotatedToken);
    return res.json({ ok: true, username: nextUsername });
  });

  // Protected Admin Routes
  app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
    try {
      const stats = await storeDb.getAdminOverview();
      res.json(stats);
    } catch (err) {
      console.error('Overview error:', err);
      res.status(500).json({ error: 'Impossible de charger les statistiques.' });
    }
  });

  app.get('/api/admin/presence', requireAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(presenceTracker.getSnapshot());
  });

  app.get('/api/admin/presence/stream', requireAdmin, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendSnapshot = (snapshot: ReturnType<typeof presenceTracker.getSnapshot>) => {
      res.write(`event: presence\ndata: ${JSON.stringify(snapshot)}\n\n`);
    };

    sendSnapshot(presenceTracker.getSnapshot());
    const unsubscribe = presenceTracker.subscribe(sendSnapshot);

    const keepAliveTimer = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 20_000);

    req.on('close', () => {
      clearInterval(keepAliveTimer);
      unsubscribe();
      res.end();
    });
  });

  app.post('/api/admin/test-supabase', requireAdmin, async (_req, res) => {
    const status = await storeDb.initializeAndVerify();
    res.json(status);
  });

  app.get('/api/admin/products', requireAdmin, async (_req, res) => {
    const products = await storeDb.getProducts(true);
    res.json({ products });
  });

  app.post('/api/admin/products', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const name_fr = String(b.name_fr || '').trim();
      const name_ar = String(b.name_ar || name_fr).trim();
      const category_slug = String(b.category_slug || '').trim();
      const price = Number(b.price);
      const sale_price =
        b.sale_price !== null && b.sale_price !== '' && b.sale_price !== undefined
          ? Number(b.sale_price)
          : null;
      const stock = Math.max(0, Math.floor(Number(b.stock ?? 0)));

      if (!name_fr || !category_slug || !Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: 'Nom, catégorie et prix valide requis.' });
      }
      if (sale_price !== null && (!Number.isFinite(sale_price) || sale_price < 0)) {
        return res.status(400).json({ error: 'Prix promotionnel invalide.' });
      }

      const images = Array.isArray(b.images)
        ? b.images.map((u: unknown) => String(u).trim()).filter((u: string) => u && isSafeUrl(u))
        : [];

      const variations: ProductVariation[] = Array.isArray(b.variations)
        ? b.variations
            .filter((v: Record<string, unknown>) => v && String(v.label_fr || '').trim())
            .map((v: Record<string, unknown>, idx: number) => ({
              id: String(v.id || `var-${Date.now()}-${idx}`),
              label_fr: String(v.label_fr || '').trim(),
              label_ar: String(v.label_ar || v.label_fr || '').trim(),
              price_delta: Number(v.price_delta || 0) || 0,
            }))
        : [];

      const created = await storeDb.createProduct({
        slug: String(b.slug || name_fr),
        category_slug,
        name_fr,
        name_ar,
        short_desc_fr: String(b.short_desc_fr || '').trim(),
        short_desc_ar: String(b.short_desc_ar || '').trim(),
        description_fr: String(b.description_fr || '').trim(),
        description_ar: String(b.description_ar || '').trim(),
        price,
        sale_price,
        stock,
        images,
        variations,
        is_visible: b.is_visible !== false,
        is_featured: Boolean(b.is_featured),
        is_bestseller: Boolean(b.is_bestseller),
        is_new_arrival: Boolean(b.is_new_arrival),
      });
      return res.status(201).json({ product: created });
    } catch (err) {
      console.error('Create product error:', err);
      const message = err instanceof Error ? err.message : 'Erreur lors de la création du produit.';
      return res.status(500).json({ error: message });
    }
  });

  app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const patch: Partial<Product> = {};

      if (b.name_fr !== undefined) patch.name_fr = String(b.name_fr).trim();
      if (b.name_ar !== undefined) patch.name_ar = String(b.name_ar).trim();
      if (b.slug !== undefined) patch.slug = String(b.slug).trim();
      if (b.category_slug !== undefined) patch.category_slug = String(b.category_slug).trim();
      if (b.short_desc_fr !== undefined) patch.short_desc_fr = String(b.short_desc_fr).trim();
      if (b.short_desc_ar !== undefined) patch.short_desc_ar = String(b.short_desc_ar).trim();
      if (b.description_fr !== undefined) patch.description_fr = String(b.description_fr).trim();
      if (b.description_ar !== undefined) patch.description_ar = String(b.description_ar).trim();
      if (b.price !== undefined) {
        const p = Number(b.price);
        if (!Number.isFinite(p) || p < 0) return res.status(400).json({ error: 'Prix invalide.' });
        patch.price = p;
      }
      if (b.sale_price !== undefined) {
        if (b.sale_price === null || b.sale_price === '') {
          patch.sale_price = null;
        } else {
          const sp = Number(b.sale_price);
          if (!Number.isFinite(sp) || sp < 0) {
            return res.status(400).json({ error: 'Prix promotionnel invalide.' });
          }
          patch.sale_price = sp;
        }
      }
      if (b.stock !== undefined) {
        patch.stock = Math.max(0, Math.floor(Number(b.stock)));
      }
      if (Array.isArray(b.images)) {
        patch.images = b.images
          .map((u: unknown) => String(u).trim())
          .filter((u: string) => u && isSafeUrl(u));
      }
      if (Array.isArray(b.variations)) {
        patch.variations = b.variations
          .filter((v: Record<string, unknown>) => v && String(v.label_fr || '').trim())
          .map((v: Record<string, unknown>, idx: number) => ({
            id: String(v.id || `var-${Date.now()}-${idx}`),
            label_fr: String(v.label_fr || '').trim(),
            label_ar: String(v.label_ar || v.label_fr || '').trim(),
            price_delta: Number(v.price_delta || 0) || 0,
          }));
      }
      if (typeof b.is_visible === 'boolean') patch.is_visible = b.is_visible;
      if (typeof b.is_featured === 'boolean') patch.is_featured = b.is_featured;
      if (typeof b.is_bestseller === 'boolean') patch.is_bestseller = b.is_bestseller;
      if (typeof b.is_new_arrival === 'boolean') patch.is_new_arrival = b.is_new_arrival;

      const updated = await storeDb.updateProduct(req.params.id, patch);
      if (!updated) {
        return res.status(404).json({ error: 'Produit introuvable.' });
      }
      return res.json({ product: updated });
    } catch (err) {
      console.error('Update product error:', err);
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour.';
      return res.status(500).json({ error: message });
    }
  });

  app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
    try {
      const deleted = await storeDb.deleteProduct(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Produit introuvable.' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('Delete product error:', err);
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression.';
      return res.status(500).json({ error: message });
    }
  });

  app.get('/api/admin/orders', requireAdmin, async (_req, res) => {
    try {
      const orders = await storeDb.getOrders();
      return res.json({ orders });
    } catch (err) {
      console.error('Get orders error:', err);
      return res.status(500).json({ error: 'Impossible de charger les commandes.' });
    }
  });

  app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
    try {
      const status = String(req.body?.status || '') as OrderStatus;
      if (!ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Statut de commande invalide.' });
      }
      const updated = await storeDb.updateOrderStatus(req.params.id, status);
      if (!updated) return res.status(404).json({ error: 'Commande introuvable.' });
      return res.json({ order: updated });
    } catch (err) {
      console.error('Update order status error:', err);
      const message = err instanceof Error ? err.message : 'Impossible de modifier le statut.';
      return res.status(500).json({ error: message });
    }
  });

  app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
    try {
      const deleted = await storeDb.deleteOrders([req.params.id]);
      if (deleted === 0) return res.status(404).json({ error: 'Commande introuvable.' });
      return res.json({ ok: true, deleted });
    } catch (err) {
      console.error('Delete order error:', err);
      const message = err instanceof Error ? err.message : 'Impossible de supprimer la commande.';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/admin/orders/bulk-delete', requireAdmin, async (req, res) => {
    try {
      const rawIds = req.body?.ids;
      if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.length > 200) {
        return res.status(400).json({ error: 'Sélection de commandes invalide (1 à 200).' });
      }
      const ids = rawIds.map((id: unknown) => String(id || '').trim()).filter(Boolean);
      if (ids.length === 0) {
        return res.status(400).json({ error: 'Aucune commande valide sélectionnée.' });
      }
      const deleted = await storeDb.deleteOrders(ids);
      return res.json({ ok: true, deleted });
    } catch (err) {
      console.error('Bulk delete orders error:', err);
      const message = err instanceof Error ? err.message : 'Impossible de supprimer les commandes.';
      return res.status(500).json({ error: message });
    }
  });

  app.get('/api/admin/categories', requireAdmin, async (_req, res) => {
    try {
      const categories = await storeDb.getCategories(false);
      return res.json({ categories });
    } catch (err) {
      console.error('Get categories error:', err);
      return res.status(500).json({ error: 'Impossible de charger les catégories.' });
    }
  });

  app.put('/api/admin/categories/:id', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      if (b.image_url !== undefined && !isSafeUrl(String(b.image_url))) {
        return res.status(400).json({ error: 'URL d’image invalide.' });
      }
      const updated = await storeDb.updateCategory(req.params.id, {
        name_fr: b.name_fr !== undefined ? String(b.name_fr).trim() : undefined,
        name_ar: b.name_ar !== undefined ? String(b.name_ar).trim() : undefined,
        description_fr: b.description_fr !== undefined ? String(b.description_fr).trim() : undefined,
        description_ar: b.description_ar !== undefined ? String(b.description_ar).trim() : undefined,
        image_url: b.image_url !== undefined ? String(b.image_url).trim() : undefined,
        is_active: typeof b.is_active === 'boolean' ? b.is_active : undefined,
      });
      if (!updated) return res.status(404).json({ error: 'Catégorie introuvable.' });
      return res.json({ category: updated });
    } catch (err) {
      console.error('Update category error:', err);
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour.';
      return res.status(500).json({ error: message });
    }
  });

  app.get('/api/admin/settings', requireAdmin, async (_req, res) => {
    try {
      const settings = await storeDb.getSettings();
      return res.json({ settings });
    } catch (err) {
      console.error('Get settings error:', err);
      return res.status(500).json({ error: 'Impossible de charger les paramètres.' });
    }
  });

  app.put('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const urlFields = ['logo_url', 'hero_image'] as const;
      for (const field of urlFields) {
        if (b[field] !== undefined && !isSafeUrl(String(b[field]))) {
          return res.status(400).json({ error: `URL invalide pour ${field}.` });
        }
      }

      const patch: Partial<SiteSettings> = {};
      if (b.brand_name !== undefined) patch.brand_name = String(b.brand_name).trim();
      if (b.brand_tagline !== undefined) patch.brand_tagline = String(b.brand_tagline).trim();
      if (b.logo_url !== undefined) patch.logo_url = String(b.logo_url).trim();
      if (b.hero_image !== undefined) patch.hero_image = String(b.hero_image).trim();
      if (b.hero_title_fr !== undefined) patch.hero_title_fr = String(b.hero_title_fr).trim();
      if (b.hero_title_ar !== undefined) patch.hero_title_ar = String(b.hero_title_ar).trim();
      if (b.hero_subtitle_fr !== undefined) patch.hero_subtitle_fr = String(b.hero_subtitle_fr).trim();
      if (b.hero_subtitle_ar !== undefined) patch.hero_subtitle_ar = String(b.hero_subtitle_ar).trim();
      if (typeof b.promo_enabled === 'boolean') patch.promo_enabled = b.promo_enabled;
      if (b.promo_text_fr !== undefined) patch.promo_text_fr = String(b.promo_text_fr).trim();
      if (b.promo_text_ar !== undefined) patch.promo_text_ar = String(b.promo_text_ar).trim();
      if (b.shipping_fee !== undefined) patch.shipping_fee = Math.max(0, Number(b.shipping_fee) || 0);
      if (b.free_shipping_threshold !== undefined)
        patch.free_shipping_threshold = Math.max(0, Number(b.free_shipping_threshold) || 0);
      if (b.contact_location_fr !== undefined)
        patch.contact_location_fr = String(b.contact_location_fr).trim();
      if (b.contact_location_ar !== undefined)
        patch.contact_location_ar = String(b.contact_location_ar).trim();
      if (b.contact_email !== undefined) patch.contact_email = String(b.contact_email).trim();
      if (b.contact_phone !== undefined) patch.contact_phone = String(b.contact_phone).trim();
      if (b.contact_whatsapp !== undefined) patch.contact_whatsapp = String(b.contact_whatsapp).trim();
      if (Array.isArray(b.featured_product_ids)) {
        patch.featured_product_ids = b.featured_product_ids.map((id: unknown) => String(id));
      }

      const updated = await storeDb.updateSettings(patch);
      return res.json({ settings: updated });
    } catch (err) {
      console.error('Update settings error:', err);
      const message = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.';
      return res.status(500).json({ error: message });
    }
  });

  // Magic-byte validated image upload (JPG / PNG / WebP up to 5MB)
  app.post('/api/admin/upload', requireAdmin, async (req, res) => {
    try {
      const base64Raw = String(req.body?.data || '');
      const cleanBase64 = base64Raw.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      if (!cleanBase64) {
        return res.status(400).json({ error: 'Aucune donnée image reçue.' });
      }
      const buffer = Buffer.from(cleanBase64, 'base64');
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'Taille de fichier invalide (max 5 Mo).' });
      }
      const detected = detectImageMagicBytes(buffer);
      if (!detected) {
        return res.status(400).json({
          error: 'Format non autorisé. Seuls JPG, PNG et WebP valides sont acceptés.',
        });
      }

      const result = await storeDb.uploadMedia(buffer, detected);
      return res.status(201).json(result);
    } catch (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Échec du téléversement.' });
    }
  });

  return app;
}
