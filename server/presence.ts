import type { LivePresenceStats, LiveVisitorSummary } from '../src/types/store.js';

interface ActiveVisitorRecord {
  visitorId: string;
  ip: string;
  path: string;
  firstSeen: number;
  lastSeen: number;
}

type PresenceListener = (snapshot: LivePresenceStats) => void;

const VISITOR_TTL_MS = 35_000;
const CLEANUP_INTERVAL_MS = 10_000;
const MAX_VISITORS_GLOBAL = 5_000;
const MAX_VISITORS_PER_IP = 12;
const PING_WINDOW_MS = 10_000;
const MAX_PINGS_PER_WINDOW = 60;

const VISITOR_ID_REGEX = /^[a-zA-Z0-9_-]{12,64}$/;
const SAFE_PATH_REGEX = /^\/[a-zA-Z0-9/_-]{0,119}$/;

function classifySection(path: string): {
  section: keyof LivePresenceStats['by_section'];
  label: string;
} {
  if (path === '/') {
    return { section: 'home', label: 'Accueil' };
  }
  if (path === '/shop' || path.startsWith('/shop/')) {
    return { section: 'shop', label: 'Boutique' };
  }
  if (path.startsWith('/product/')) {
    return { section: 'product', label: 'Fiche produit' };
  }
  if (path === '/checkout' || path.startsWith('/order/')) {
    return { section: 'checkout', label: 'Commande' };
  }
  return { section: 'other', label: 'Navigation' };
}

class PresenceTracker {
  private visitors = new Map<string, ActiveVisitorRecord>();
  private pingBuckets = new Map<string, { count: number; resetAt: number }>();
  private listeners = new Set<PresenceListener>();
  private lastSignature = '';

  constructor() {
    const timer = setInterval(() => {
      const removed = this.pruneExpired();
      if (removed > 0) {
        this.notifyIfChanged();
      }
    }, CLEANUP_INTERVAL_MS);
    timer.unref();
  }

  public sanitizeVisitorId(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return VISITOR_ID_REGEX.test(trimmed) ? trimmed : null;
  }

  public sanitizePath(raw: unknown): string | null {
    if (typeof raw !== 'string') return '/';
    const base = raw.split(/[?#]/)[0].trim() || '/';
    if (base === '/admin' || base.startsWith('/admin/')) {
      return null;
    }
    return SAFE_PATH_REGEX.test(base) ? base : '/';
  }

  private checkPingRateLimit(ip: string, now: number): boolean {
    const bucket = this.pingBuckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      if (this.pingBuckets.size > 10_000) {
        this.pingBuckets.clear();
      }
      this.pingBuckets.set(ip, { count: 1, resetAt: now + PING_WINDOW_MS });
      return true;
    }
    if (bucket.count >= MAX_PINGS_PER_WINDOW) {
      return false;
    }
    bucket.count += 1;
    return true;
  }

  private pruneExpired(now = Date.now()): number {
    let removed = 0;
    for (const [id, rec] of this.visitors.entries()) {
      if (now - rec.lastSeen > VISITOR_TTL_MS) {
        this.visitors.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  public ping(rawVisitorId: unknown, ip: string, rawPath: unknown): boolean {
    const visitorId = this.sanitizeVisitorId(rawVisitorId);
    if (!visitorId) return false;

    const cleanPath = this.sanitizePath(rawPath);
    if (!cleanPath) {
      // If a visitor navigated into /admin, remove them from storefront count
      this.leave(visitorId);
      return true;
    }

    const now = Date.now();
    const cleanIp = (ip || 'unknown').slice(0, 64);
    if (!this.checkPingRateLimit(cleanIp, now)) {
      return false;
    }

    this.pruneExpired(now);

    const existing = this.visitors.get(visitorId);
    if (existing) {
      const pathChanged = existing.path !== cleanPath;
      existing.path = cleanPath;
      existing.lastSeen = now;
      existing.ip = cleanIp;
      if (pathChanged) {
        this.notifyIfChanged();
      }
      return true;
    }

    // Enforce global capacity and per-IP distinct session cap to prevent inflation
    if (this.visitors.size >= MAX_VISITORS_GLOBAL) {
      return false;
    }
    let ipCount = 0;
    for (const rec of this.visitors.values()) {
      if (rec.ip === cleanIp) ipCount += 1;
    }
    if (ipCount >= MAX_VISITORS_PER_IP) {
      return false;
    }

    this.visitors.set(visitorId, {
      visitorId,
      ip: cleanIp,
      path: cleanPath,
      firstSeen: now,
      lastSeen: now,
    });
    this.notifyIfChanged();
    return true;
  }

  public leave(rawVisitorId: unknown): void {
    const visitorId = this.sanitizeVisitorId(rawVisitorId);
    if (!visitorId) return;
    if (this.visitors.delete(visitorId)) {
      this.notifyIfChanged();
    }
  }

  public getSnapshot(): LivePresenceStats {
    const now = Date.now();
    this.pruneExpired(now);

    const bySection: LivePresenceStats['by_section'] = {
      home: 0,
      shop: 0,
      product: 0,
      checkout: 0,
      other: 0,
    };

    const sortedRecords = Array.from(this.visitors.values()).sort(
      (a, b) => b.lastSeen - a.lastSeen
    );

    const visitors: LiveVisitorSummary[] = [];
    for (const rec of sortedRecords) {
      const info = classifySection(rec.path);
      bySection[info.section] += 1;
      if (visitors.length < 25) {
        visitors.push({
          page_label: info.label,
          path: rec.path,
          active_seconds: Math.max(1, Math.round((now - rec.firstSeen) / 1000)),
        });
      }
    }

    return {
      active_clients: this.visitors.size,
      by_section: bySection,
      visitors,
      updated_at: new Date(now).toISOString(),
    };
  }

  public subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyIfChanged(): void {
    const snapshot = this.getSnapshot();
    const sig = JSON.stringify({
      active_clients: snapshot.active_clients,
      by_section: snapshot.by_section,
      paths: snapshot.visitors.map((v) => v.path),
    });
    if (sig === this.lastSignature) return;
    this.lastSignature = sig;

    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Ignore broken SSE stream listeners
      }
    }
  }
}

export const presenceTracker = new PresenceTracker();
