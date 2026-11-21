import crypto from 'crypto';
import path from 'path';
import type { Request } from 'express';

// Ephemeral fallback secret per server boot when SESSION_SECRET isn't configured in env.
// Keeps signing key strictly in memory and never hardcoded.
const IN_MEMORY_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  return envSecret && envSecret.length >= 16 ? envSecret : IN_MEMORY_SESSION_SECRET;
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64, { N: 16384, r: 8, p: 1 });
  return {
    hash: derived.toString('hex'),
    salt: actualSalt,
  };
}

export function verifyPassword(password: string, expectedHash: string, salt: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

export function verifyEnvPasscode(input: string, envPasscode: string): boolean {
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(envPasscode, 'utf8');
  if (a.length !== b.length) {
    // Perform constant-time comparison against dummy buffer of same length to avoid timing leak
    const dummy = Buffer.alloc(b.length);
    crypto.timingSafeEqual(dummy, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

interface SessionPayload {
  role: 'admin';
  iat: number;
  exp: number;
  jti: string;
}

export function createAdminToken(ttlSeconds = 12 * 60 * 60): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    role: 'admin',
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomBytes(12).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(sigB64, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SessionPayload;
    if (parsed.role !== 'admin') return false;
    const now = Math.floor(Date.now() / 1000);
    return typeof parsed.exp === 'number' && parsed.exp > now;
  } catch {
    return false;
  }
}

export function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim().slice(0, 64);
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).split(',')[0].trim().slice(0, 64);
  }
  return (req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

// Public order creation rate limiter: max 8 orders per 10 minutes per IP
const orderRateMap = new Map<string, number[]>();

export function checkOrderRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const maxRequests = 8;

  const timestamps = (orderRateMap.get(ip) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    orderRateMap.set(ip, timestamps);
    return { allowed: false, retryAfterSeconds };
  }
  timestamps.push(now);
  orderRateMap.set(ip, timestamps);
  return { allowed: true, retryAfterSeconds: 0 };
}

export type SupportedImageFormat = {
  ext: 'jpg' | 'png' | 'webp';
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
};

export function detectImageMagicBytes(buf: Buffer): SupportedImageFormat | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }

  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }

  return null;
}

export function resolveConfinedPath(baseDir: string, unsafeFilename: string): string | null {
  const baseResolved = path.resolve(baseDir);
  const cleanName = path.basename(unsafeFilename).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!cleanName || cleanName.startsWith('.')) return null;
  const resolved = path.resolve(baseResolved, cleanName);
  if (!resolved.startsWith(baseResolved + path.sep)) {
    return null;
  }
  return resolved;
}

export function isSafeUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//');
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
