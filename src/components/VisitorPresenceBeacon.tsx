import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const VISITOR_STORAGE_KEY = 'maxpro_visitor_id';
const HEARTBEAT_INTERVAL_MS = 15_000;

function getOrCreateVisitorId(): string {
  try {
    const existing = window.sessionStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{12,64}$/.test(existing)) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
    window.sessionStorage.setItem(VISITOR_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  }
}

export function VisitorPresenceBeacon() {
  const { pathname } = useLocation();
  const visitorIdRef = useRef<string>('');
  const wasStorefrontRef = useRef(false);

  if (!visitorIdRef.current && typeof window !== 'undefined') {
    visitorIdRef.current = getOrCreateVisitorId();
  }

  useEffect(() => {
    const visitorId = visitorIdRef.current;
    if (!visitorId) return;

    const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

    const sendLeaveBeacon = () => {
      const payload = JSON.stringify({ visitorId });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon('/api/presence/leave', blob)) {
          return;
        }
      }
      void fetch('/api/presence/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    };

    if (isAdminRoute) {
      if (wasStorefrontRef.current) {
        wasStorefrontRef.current = false;
        sendLeaveBeacon();
      }
      return;
    }

    wasStorefrontRef.current = true;

    const sendPing = () => {
      if (document.visibilityState === 'hidden') return;
      void fetch('/api/presence/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, path: pathname }),
        keepalive: true,
      }).catch(() => {});
    };

    sendPing();

    const interval = window.setInterval(sendPing, HEARTBEAT_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendPing();
      }
    };
    const onPageHide = () => {
      sendLeaveBeacon();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
    };
  }, [pathname]);

  return null;
}
