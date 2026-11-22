import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Database,
  Edit3,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatTnd, ORDER_STATUS_STYLES } from '../i18n/translations';
import {
  ORDER_STATUSES,
  type AdminOverviewStats,
  type Category,
  type Order,
  type OrderStatus,
  type Product,
  type ProductVariation,
  type SiteSettings,
} from '../types/store';
import { SafeImage } from '../components/SafeImage';

type AdminTab = 'overview' | 'products' | 'orders' | 'customization' | 'security';

interface AuthStatus {
  needsSetup: boolean;
  envManaged: boolean;
  requiresSetupKey: boolean;
  authenticated: boolean;
  username?: string;
  locked?: boolean;
  remainingSeconds?: number;
}

async function readFileAsBase64(file: File): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    reader.readAsDataURL(file);
  });

  // Compress large photos cleanly to WebP (max 1400px) so product pages stay fast
  if (file.size <= 140 * 1024) return rawDataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = rawDataUrl;
    });
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const webp = canvas.toDataURL('image/webp', 0.82);
    return webp.startsWith('data:image/webp') && webp.length < rawDataUrl.length ? webp : rawDataUrl;
  } catch {
    return rawDataUrl;
  }
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function AdminPage() {
  const { lang, t, refreshStorefront } = useStore();

  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Admin data states
  const [overview, setOverview] = useState<AdminOverviewStats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<SiteSettings | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Filters & Modals
  const [productSearch, setProductSearch] = useState('');
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | OrderStatus>('all');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [confirmBulkDeleteOrders, setConfirmBulkDeleteOrders] = useState(false);
  const [deletingOrders, setDeletingOrders] = useState(false);

  const [savingSettings, setSavingSettings] = useState(false);
  const [testingSupabase, setTestingSupabase] = useState(false);

  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwNewUsername, setPwNewUsername] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  const showToast = useCallback((type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const authFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers || {});
    headers.set('X-Requested-With', 'maxpro-admin');
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(url, { ...init, headers, credentials: 'include' });
    if (res.status === 401) {
      setAuthStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
    }
    return res;
  }, []);

  const loadAuthStatus = useCallback(async () => {
    setStatusError('');
    try {
      const res = await fetch('/api/admin/auth/status', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as AuthStatus;
        setAuthStatus((prev) => ({
          ...data,
          authenticated: Boolean(data.authenticated),
          needsSetup: prev?.needsSetup === false ? false : data.needsSetup,
          locked: false,
          remainingSeconds: 0,
        }));
      } else {
        setStatusError('Impossible de vérifier le statut de connexion administrateur.');
      }
    } catch {
      setStatusError('Service API inaccessible. Vérifiez le déploiement du serveur.');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAuthStatus();
  }, [loadAuthStatus]);

  // Live 1s countdown when scoped backoff cooldown is active
  useEffect(() => {
    const rem = authStatus?.remainingSeconds || 0;
    if (!authStatus?.locked || rem <= 0) return;
    const timer = setInterval(() => {
      setAuthStatus((prev) => {
        if (!prev || !prev.locked) return prev;
        const nextSec = (prev.remainingSeconds || 0) - 1;
        if (nextSec <= 0) {
          return { ...prev, locked: false, remainingSeconds: 0 };
        }
        return { ...prev, remainingSeconds: nextSec };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [authStatus?.locked, authStatus?.remainingSeconds]);

  const loadAdminData = useCallback(async () => {
    if (!authStatus?.authenticated) return;
    setDataLoading(true);
    try {
      const [ovRes, prRes, orRes, caRes, seRes] = await Promise.all([
        authFetch('/api/admin/overview'),
        authFetch('/api/admin/products'),
        authFetch('/api/admin/orders'),
        authFetch('/api/admin/categories'),
        authFetch('/api/admin/settings'),
      ]);
      if (ovRes.ok) setOverview(await ovRes.json());
      if (prRes.ok) setProducts(((await prRes.json()).products || []) as Product[]);
      if (orRes.ok) setOrders(((await orRes.json()).orders || []) as Order[]);
      if (caRes.ok) setCategories(((await caRes.json()).categories || []) as Category[]);
      if (seRes.ok) setSettingsDraft(((await seRes.json()).settings || null) as SiteSettings);
    } finally {
      setDataLoading(false);
    }
  }, [authStatus?.authenticated, authFetch]);

  useEffect(() => {
    if (authStatus?.authenticated) {
      if (authStatus.username) {
        setPwNewUsername((prev) => prev || authStatus.username || '');
      }
      void loadAdminData();
    }
  }, [authStatus?.authenticated, authStatus?.username, loadAdminData]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (username.trim().length < 3) {
      setAuthError('L’identifiant doit contenir au moins 3 caractères.');
      return;
    }
    if (password.length < 12) {
      setAuthError('Le mot de passe doit contenir au moins 12 caractères.');
      return;
    }
    if (authStatus?.requiresSetupKey && !setupKey.trim()) {
      setAuthError('La clé de configuration serveur est requise.');
      return;
    }
    setAuthSubmitting(true);
    try {
      let res = await fetch('/api/admin/auth/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'maxpro-admin',
        },
        credentials: 'include',
        body: JSON.stringify({
          username: username.trim(),
          password,
          ...(setupKey.trim() ? { setupKey: setupKey.trim() } : {}),
        }),
      });

      // If already claimed concurrently or in DB, fall back to verifying against existing login
      if (res.status === 409) {
        res = await fetch('/api/admin/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'maxpro-admin',
          },
          credentials: 'include',
          body: JSON.stringify({ username: username.trim(), password }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data?.error || 'Impossible d’activer le compte.');
        setAuthStatus((prev) =>
          prev
            ? {
                ...prev,
                locked: Boolean(data.locked),
                remainingSeconds: Number(data.remainingSeconds || 0),
              }
            : prev
        );
        return;
      }
      setPassword('');
      setSetupKey('');
      setAuthStatus({
        needsSetup: false,
        envManaged: false,
        requiresSetupKey: Boolean(authStatus?.requiresSetupKey),
        authenticated: true,
        locked: false,
        remainingSeconds: 0,
      });
    } catch {
      setAuthError('Erreur réseau.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'maxpro-admin',
        },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data?.error || 'Échec de connexion.');
        setAuthStatus((prev) =>
          prev
            ? {
                ...prev,
                locked: Boolean(data.locked),
                remainingSeconds: Number(data.remainingSeconds || 0),
              }
            : prev
        );
        return;
      }
      setPassword('');
      setAuthStatus({
        needsSetup: false,
        envManaged: Boolean(authStatus?.envManaged),
        requiresSetupKey: Boolean(authStatus?.requiresSetupKey),
        authenticated: true,
        locked: false,
        remainingSeconds: 0,
      });
    } catch {
      setAuthError('Erreur réseau.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: { 'X-Requested-With': 'maxpro-admin' },
        credentials: 'include',
      });
    } catch {
      // Clear local state regardless
    }
    setAuthStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
  };

  const uploadImageFile = async (file: File): Promise<string | null> => {
    if (file.size > 5 * 1024 * 1024) {
      showToast('err', 'Fichier trop volumineux (max 5 Mo).');
      return null;
    }
    setUploadingImage(true);
    try {
      const data = await readFileAsBase64(file);
      const res = await authFetch('/api/admin/upload', {
        method: 'POST',
        body: JSON.stringify({ data }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast('err', json?.error || 'Échec du téléversement.');
        return null;
      }
      showToast('ok', `Image enregistrée (${json.storage === 'supabase' ? 'Supabase' : 'Local'}).`);
      return String(json.url);
    } catch {
      showToast('err', 'Erreur lors du téléversement.');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const openNewProductModal = () => {
    setEditingProduct({
      name_fr: '',
      name_ar: '',
      slug: '',
      category_slug: categories[0]?.slug || 'parfums-habitacle',
      short_desc_fr: '',
      short_desc_ar: '',
      description_fr: '',
      description_ar: '',
      price: 0,
      sale_price: null,
      stock: 10,
      images: [],
      variations: [],
      is_visible: true,
      is_featured: false,
      is_bestseller: false,
      is_new_arrival: true,
    });
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setSavingProduct(true);
    try {
      const isEdit = Boolean(editingProduct.id);
      const url = isEdit ? `/api/admin/products/${editingProduct.id}` : '/api/admin/products';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await authFetch(url, {
        method,
        body: JSON.stringify(editingProduct),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast('err', json?.error || 'Erreur lors de la sauvegarde.');
        return;
      }
      setEditingProduct(null);
      showToast('ok', isEdit ? 'Produit mis à jour.' : 'Produit créé.');
      await Promise.all([loadAdminData(), refreshStorefront()]);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleQuickProductToggle = async (product: Product, field: 'is_visible' | 'is_featured' | 'is_bestseller' | 'is_new_arrival') => {
    const res = await authFetch(`/api/admin/products/${product.id}`, {
      method: 'PUT',
      body: JSON.stringify({ [field]: !product[field] }),
    });
    if (res.ok) {
      await Promise.all([loadAdminData(), refreshStorefront()]);
    } else {
      const json = await res.json().catch(() => ({}));
      showToast('err', json?.error || 'Impossible de modifier le produit.');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    const res = await authFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setDeletingProductId(null);
      showToast('ok', 'Produit supprimé.');
      await Promise.all([loadAdminData(), refreshStorefront()]);
    } else {
      const json = await res.json().catch(() => ({}));
      showToast('err', json?.error || 'Impossible de supprimer le produit.');
    }
  };

  const handleOrderStatusChange = async (orderId: string, status: OrderStatus) => {
    const res = await authFetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      showToast('ok', 'Statut mis à jour.');
      await loadAdminData();
    } else {
      const json = await res.json().catch(() => ({}));
      showToast('err', json?.error || 'Impossible de modifier le statut.');
    }
  };

  const toggleOrderSelection = (orderId: string) => {
    setConfirmBulkDeleteOrders(false);
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const handleDeleteSingleOrder = async (orderId: string) => {
    setDeletingOrders(true);
    try {
      const res = await authFetch(`/api/admin/orders/${orderId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeletingOrderId(null);
        setSelectedOrderIds((prev) => prev.filter((id) => id !== orderId));
        showToast('ok', 'Commande supprimée.');
        await loadAdminData();
      } else {
        const json = await res.json().catch(() => ({}));
        showToast('err', json?.error || 'Impossible de supprimer la commande.');
      }
    } finally {
      setDeletingOrders(false);
    }
  };

  const handleBulkDeleteOrders = async () => {
    if (selectedOrderIds.length === 0) return;
    setDeletingOrders(true);
    try {
      const res = await authFetch('/api/admin/orders/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedOrderIds }),
      });
      if (res.ok) {
        const count = selectedOrderIds.length;
        setSelectedOrderIds([]);
        setConfirmBulkDeleteOrders(false);
        showToast('ok', `${count} commande(s) supprimée(s).`);
        await loadAdminData();
      } else {
        const json = await res.json().catch(() => ({}));
        showToast('err', json?.error || 'Impossible de supprimer les commandes.');
      }
    } finally {
      setDeletingOrders(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsDraft) return;
    setSavingSettings(true);
    try {
      const res = await authFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsDraft),
      });
      if (res.ok) {
        showToast('ok', 'Personnalisation enregistrée.');
        await Promise.all([loadAdminData(), refreshStorefront()]);
      } else {
        const json = await res.json().catch(() => ({}));
        showToast('err', json?.error || 'Erreur de sauvegarde.');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveCategory = async (cat: Category) => {
    const res = await authFetch(`/api/admin/categories/${cat.id}`, {
      method: 'PUT',
      body: JSON.stringify(cat),
    });
    if (res.ok) {
      showToast('ok', `Catégorie « ${cat.name_fr} » enregistrée.`);
      await Promise.all([loadAdminData(), refreshStorefront()]);
    } else {
      const json = await res.json().catch(() => ({}));
      showToast('err', json?.error || 'Erreur lors de la mise à jour de la catégorie.');
    }
  };


  const handleTestSupabase = async () => {
    setTestingSupabase(true);
    try {
      const res = await authFetch('/api/admin/test-supabase', { method: 'POST' });
      const data = await res.json();
      if (data.mode === 'supabase') {
        showToast('ok', 'Connexion Supabase PostgreSQL active.');
      } else {
        showToast('err', data.error || 'Supabase inactif — SQLite local actif.');
      }
      await loadAdminData();
    } finally {
      setTestingSupabase(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (!pwCurrent) {
      setPwError('Veuillez saisir votre mot de passe actuel.');
      return;
    }
    if (pwNext.length < 12) {
      setPwError('Le nouveau mot de passe doit contenir au moins 12 caractères.');
      return;
    }
    if (pwNext !== pwConfirm) {
      setPwError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    if (pwNewUsername.trim() && pwNewUsername.trim().length < 3) {
      setPwError('L’identifiant doit contenir au moins 3 caractères.');
      return;
    }

    setPwSaving(true);
    try {
      const res = await authFetch('/api/admin/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: pwCurrent,
          newPassword: pwNext,
          ...(pwNewUsername.trim() ? { newUsername: pwNewUsername.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPwError(json?.error || 'Impossible de modifier le mot de passe.');
        return;
      }
      setPwCurrent('');
      setPwNext('');
      setPwConfirm('');
      if (json?.username) {
        setPwNewUsername(String(json.username));
        setAuthStatus((prev) => (prev ? { ...prev, username: String(json.username) } : prev));
      }
      showToast('ok', 'Mot de passe administrateur mis à jour.');
    } catch {
      setPwError('Erreur réseau lors de la mise à jour.');
    } finally {
      setPwSaving(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name_fr.toLowerCase().includes(q) ||
        p.name_ar.toLowerCase().includes(q) ||
        p.category_slug.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false;
      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q)
      );
    });
  }, [orders, orderSearch, orderStatusFilter]);

  if (authLoading) {
    return (
      <div className="min-h-screen pt-40 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Hardened Lock Screen / Setup / Login Gate
  if (!authStatus?.authenticated) {
    return (
      <div className="min-h-screen pt-24 sm:pt-36 pb-16 px-4 flex items-center justify-center">
        <div className="w-full max-w-md glass-panel rounded-3xl p-5 sm:p-8 space-y-6">
          {statusError ? (
            <div className="space-y-4 text-center py-2">
              <p className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200">
                {statusError}
              </p>
              <button
                type="button"
                onClick={() => void loadAuthStatus()}
                className="min-h-[44px] px-6 rounded-xl bg-white text-zinc-950 font-semibold text-sm hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                Réessayer
              </button>
            </div>
          ) : authStatus?.locked ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto text-red-300">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h1 className="font-display text-2xl font-semibold text-white">
                {t.admin.lockedTitle}
              </h1>
              <p className="text-sm text-zinc-400">{t.admin.lockedSubtitle}</p>
              <div className="py-4 rounded-2xl bg-black/40 border border-white/10">
                <span dir="ltr" className="font-mono text-3xl font-semibold text-white tabular-nums">
                  {formatCountdown(authStatus.remainingSeconds || 0)}
                </span>
              </div>
            </div>
          ) : authStatus?.needsSetup ? (
            <form onSubmit={handleSetup} className="space-y-4 sm:space-y-5">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white mb-3">
                  <Lock className="w-5 h-5" />
                </div>
                <h1 className="font-display text-xl sm:text-2xl font-semibold text-white">
                  {t.admin.setupTitle}
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400">{t.admin.setupSubtitle}</p>
              </div>

              {authError && (
                <p className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200">
                  {authError}
                </p>
              )}

              {authStatus.requiresSetupKey && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-300">
                    Clé d’initialisation (ADMIN_SETUP_KEY)
                  </span>
                  <input
                    type="password"
                    required
                    autoComplete="one-time-code"
                    value={setupKey}
                    onChange={(e) => setSetupKey(e.target.value)}
                    placeholder="Clé secrète configurée sur le serveur"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                  />
                </label>
              )}

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-300">{t.admin.usernameLabel}</span>
                <input
                  type="text"
                  required
                  minLength={3}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Identifiant administrateur"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-300">
                  {t.admin.passwordLabel} (12 caractères minimum)
                </span>
                <input
                  type="password"
                  required
                  minLength={12}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 12 caractères"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                />
              </label>

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full min-h-[46px] rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 font-semibold text-sm transition-colors cursor-pointer"
              >
                {authSubmitting ? '...' : t.admin.createPasswordBtn}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white mb-3">
                  <Lock className="w-5 h-5" />
                </div>
                <h1 className="font-display text-xl sm:text-2xl font-semibold text-white">
                  {t.admin.loginTitle}
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400">{t.admin.loginSubtitle}</p>
              </div>

              {authError && (
                <p className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-200">
                  {authError}
                </p>
              )}

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-300">{t.admin.usernameLabel}</span>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Identifiant"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-300">{t.admin.passwordLabel}</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                />
              </label>

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full min-h-[46px] rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 font-semibold text-sm transition-colors cursor-pointer"
              >
                {authSubmitting ? '...' : t.admin.loginBtn}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 sm:pt-36 pb-20 max-w-7xl mx-auto px-3.5 sm:px-6 space-y-6 sm:space-y-8">
      {toast && (
        <div
          className={`fixed bottom-4 inset-x-4 sm:inset-x-auto sm:bottom-5 sm:end-5 z-50 px-4 py-3 rounded-xl border text-xs sm:text-sm font-medium shadow-xl backdrop-blur-xl ${
            toast.type === 'ok'
              ? 'bg-zinc-900/95 border-white/15 text-white'
              : 'bg-red-950/95 border-red-500/40 text-red-100'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Admin Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 sm:pb-6 border-b border-white/[0.08]">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white">
            {t.admin.title}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {overview?.storage_mode === 'supabase'
              ? 'Base active : Supabase PostgreSQL'
              : 'Base active : SQLite local (repli résilient)'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadAdminData()}
            className="min-h-[40px] px-3.5 rounded-xl border border-white/10 text-xs font-medium text-zinc-200 hover:bg-white/[0.06] inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="min-h-[40px] px-3.5 rounded-xl border border-white/10 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] inline-flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t.admin.logout}</span>
          </button>
        </div>
      </div>

      {overview && overview.storage_mode !== 'supabase' && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-amber-100">
                Supabase non lié — Stockage temporaire local actif
              </p>
              <p className="text-xs text-amber-200/80">
                {overview.supabase_error ||
                  'Configurez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY puis exécutez supabase/schema.sql dans Supabase SQL Editor.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleTestSupabase()}
              disabled={testingSupabase}
              className="min-h-[38px] px-3.5 rounded-xl bg-amber-300 text-zinc-950 text-xs font-semibold hover:bg-amber-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              {testingSupabase ? 'Test...' : 'Tester Supabase'}
            </button>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {(
          [
            { id: 'overview', label: t.admin.tabOverview },
            { id: 'products', label: `${t.admin.tabProducts} (${products.length})` },
            { id: 'orders', label: `${t.admin.tabOrders} (${orders.length})` },
            { id: 'customization', label: t.admin.tabCustomization },
            { id: 'security', label: 'Sécurité' },
          ] as Array<{ id: AdminTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-zinc-950 font-semibold'
                : 'glass-surface text-zinc-300 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Chiffre d'affaires (Aujourd'hui)", val: overview.revenue_today },
              { label: '7 derniers jours', val: overview.revenue_week },
              { label: '30 derniers jours', val: overview.revenue_month },
              { label: 'Total cumulé', val: overview.revenue_total },
            ].map((kpi) => (
              <div key={kpi.label} className="glass-surface rounded-2xl p-5 space-y-2">
                <span className="text-xs text-zinc-400 block">{kpi.label}</span>
                <span className="text-2xl font-semibold text-white tabular-nums block">
                  {formatTnd(kpi.val, lang)}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 glass-surface rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-semibold text-white">
                Répartition des commandes ({overview.orders_total})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ORDER_STATUSES.map((status) => {
                  const style = ORDER_STATUS_STYLES[status];
                  return (
                    <div
                      key={status}
                      className={`p-3.5 rounded-xl bg-black/35 border ${style.cardBorder} space-y-1`}
                    >
                      <span className={`text-xs font-medium inline-flex items-center gap-1.5 ${style.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {status}
                      </span>
                      <span className="text-xl font-semibold text-white tabular-nums block">
                        {overview.orders_by_status[status] || 0}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-6 glass-surface rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h2 className="text-base font-semibold text-white">
                  Alertes stock faible (&le; 5 unités)
                </h2>
              </div>

              {overview.low_stock_products.length === 0 ? (
                <p className="text-sm text-zinc-400">Tous les produits disposent d’un stock confortable.</p>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {overview.low_stock_products.map((prod) => (
                    <div key={prod.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{prod.name_fr}</p>
                        <p className="text-xs text-amber-300 tabular-nums">
                          {prod.stock} unité(s) restante(s)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProduct(prod);
                          setActiveTab('products');
                        }}
                        className="min-h-[34px] px-3 rounded-lg border border-white/10 text-xs text-zinc-200 hover:bg-white/[0.08] shrink-0 cursor-pointer"
                      >
                        Réapprovisionner
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTS */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Rechercher un produit..."
                className="w-full min-h-[44px] ps-10 pe-4 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
              />
            </div>

            <button
              type="button"
              onClick={openNewProductModal}
              className="min-h-[42px] px-4 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau produit</span>
            </button>
          </div>

          <div className="glass-surface rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="border-b border-white/[0.08] text-xs text-zinc-400">
                  <tr>
                    <th className="py-3.5 px-4 text-start font-medium">Produit</th>
                    <th className="py-3.5 px-4 text-start font-medium">Prix</th>
                    <th className="py-3.5 px-4 text-start font-medium">Stock</th>
                    <th className="py-3.5 px-4 text-start font-medium">Statuts</th>
                    <th className="py-3.5 px-4 text-end font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredProducts.map((prod) => (
                    <tr key={prod.id} className="hover:bg-white/[0.02]">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-10 rounded-lg overflow-hidden bg-zinc-900 shrink-0">
                            <SafeImage
                              src={prod.images[0]}
                              alt={prod.name_fr}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate max-w-[220px]">
                              {prod.name_fr}
                            </p>
                            <p className="text-xs text-zinc-500">{prod.category_slug}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 tabular-nums whitespace-nowrap">
                        <span className="text-white font-medium">
                          {formatTnd(prod.sale_price ?? prod.price, lang)}
                        </span>
                        {prod.sale_price !== null && prod.sale_price < prod.price && (
                          <span className="ms-2 text-xs text-zinc-500 line-through">
                            {prod.price}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 tabular-nums">
                        <span className={prod.stock <= 5 ? 'text-amber-300 font-medium' : 'text-zinc-200'}>
                          {prod.stock}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {(
                            [
                              ['is_visible', 'Visible'],
                              ['is_featured', 'Vedette'],
                              ['is_bestseller', 'Best'],
                              ['is_new_arrival', 'Nouveau'],
                            ] as const
                          ).map(([field, label]) => (
                            <button
                              key={field}
                              type="button"
                              onClick={() => void handleQuickProductToggle(prod, field)}
                              className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                                prod[field]
                                  ? 'bg-white text-zinc-950 border-white'
                                  : 'border-white/10 text-zinc-400 hover:text-white'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingProduct(prod)}
                            className="p-2 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                            aria-label="Modifier"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {deletingProductId === prod.id ? (
                            <button
                              type="button"
                              onClick={() => void handleDeleteProduct(prod.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium cursor-pointer"
                            >
                              Confirmer
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeletingProductId(prod.id)}
                              className="p-2 rounded-lg border border-white/10 text-zinc-400 hover:text-red-400 hover:bg-white/[0.06] cursor-pointer"
                              aria-label="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Rechercher MXP-XXXXXX, client, téléphone, ville..."
                className="w-full min-h-[44px] ps-10 pe-4 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setOrderStatusFilter('all')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
                  orderStatusFilter === 'all'
                    ? 'bg-white text-zinc-950 font-semibold'
                    : 'bg-white/[0.05] text-zinc-300'
                }`}
              >
                Toutes
              </button>
              {ORDER_STATUSES.map((st) => {
                const style = ORDER_STATUS_STYLES[st];
                const isActive = orderStatusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setOrderStatusFilter(st)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                      isActive
                        ? style.badge
                        : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:text-white'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    <span>{st}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredOrders.length > 0 && (
            <div className="glass-surface rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2.5 text-xs sm:text-sm text-zinc-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={
                    filteredOrders.length > 0 &&
                    filteredOrders.every((o) => selectedOrderIds.includes(o.id))
                  }
                  onChange={(e) => {
                    setConfirmBulkDeleteOrders(false);
                    if (e.target.checked) {
                      setSelectedOrderIds(filteredOrders.map((o) => o.id));
                    } else {
                      setSelectedOrderIds([]);
                    }
                  }}
                  className="w-4 h-4 rounded border-white/25 bg-black/50 accent-white cursor-pointer"
                />
                <span>
                  Tout sélectionner ({filteredOrders.length})
                </span>
                {selectedOrderIds.length > 0 && (
                  <span className="text-xs text-zinc-400 tabular-nums">
                    · {selectedOrderIds.length} sélectionnée(s)
                  </span>
                )}
              </label>

              {selectedOrderIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {confirmBulkDeleteOrders ? (
                    <>
                      <button
                        type="button"
                        disabled={deletingOrders}
                        onClick={() => void handleBulkDeleteOrders()}
                        className="min-h-[34px] px-3.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>
                          {deletingOrders
                            ? 'Suppression...'
                            : `Confirmer la suppression (${selectedOrderIds.length})`}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={deletingOrders}
                        onClick={() => setConfirmBulkDeleteOrders(false)}
                        className="min-h-[34px] px-3 rounded-lg border border-white/15 text-xs text-zinc-300 hover:text-white cursor-pointer"
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmBulkDeleteOrders(true)}
                        className="min-h-[34px] px-3.5 rounded-lg bg-red-500/15 border border-red-500/35 text-red-300 hover:bg-red-500/25 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Supprimer la sélection ({selectedOrderIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedOrderIds([])}
                        className="min-h-[34px] px-3 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-white cursor-pointer"
                      >
                        Désélectionner
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {filteredOrders.length === 0 ? (
            <div className="glass-surface rounded-2xl p-10 text-center text-sm text-zinc-400">
              Aucune commande trouvée.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((ord) => {
                const expanded = expandedOrderId === ord.id;
                const isSelected = selectedOrderIds.includes(ord.id);
                const statusStyle = ORDER_STATUS_STYLES[ord.status];
                return (
                  <div
                    key={ord.id}
                    className={`glass-surface rounded-2xl p-4 sm:p-5 space-y-4 transition-colors ${
                      isSelected ? 'border-white/35 bg-white/[0.04]' : ''
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOrderSelection(ord.id)}
                          aria-label={`Sélectionner ${ord.order_number}`}
                          className="mt-1 w-4 h-4 rounded border-white/25 bg-black/50 accent-white shrink-0 cursor-pointer"
                        />
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span dir="ltr" className="font-mono text-sm font-semibold text-white">
                              {ord.order_number}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px] font-medium ${statusStyle.badge}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                              {ord.status}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {new Date(ord.created_at).toLocaleString('fr-FR')}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-200">
                            {ord.customer_name} · <span dir="ltr">{ord.customer_phone}</span> ·{' '}
                            {ord.city}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-base font-semibold text-white tabular-nums me-1">
                          {formatTnd(ord.total, lang)}
                        </span>

                        <select
                          value={ord.status}
                          onChange={(e) =>
                            void handleOrderStatusChange(ord.id, e.target.value as OrderStatus)
                          }
                          className={`min-h-[38px] px-3 rounded-xl border text-xs font-medium cursor-pointer focus:outline-none ${statusStyle.select}`}
                        >
                          {ORDER_STATUSES.map((st) => (
                            <option key={st} value={st} className="bg-zinc-950 text-white">
                              {st}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => setExpandedOrderId(expanded ? null : ord.id)}
                          className="min-h-[38px] px-3 rounded-xl border border-white/10 text-xs text-zinc-300 hover:text-white cursor-pointer"
                        >
                          {expanded ? 'Masquer' : 'Détails'}
                        </button>

                        {deletingOrderId === ord.id ? (
                          <button
                            type="button"
                            disabled={deletingOrders}
                            onClick={() => void handleDeleteSingleOrder(ord.id)}
                            className="min-h-[38px] px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                          >
                            Confirmer
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeletingOrderId(ord.id)}
                            aria-label="Supprimer la commande"
                            className="min-h-[38px] min-w-[38px] rounded-xl border border-white/10 text-zinc-400 hover:text-red-400 hover:border-red-500/30 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="pt-4 border-t border-white/[0.07] space-y-3 text-xs sm:text-sm">
                        <p className="text-zinc-300">
                          Adresse : {ord.address}, {ord.city}
                        </p>
                        {ord.note && <p className="text-zinc-400">Note : {ord.note}</p>}
                        {ord.items && ord.items.length > 0 && (
                          <div className="divide-y divide-white/[0.06] bg-black/30 rounded-xl px-4">
                            {ord.items.map((item) => (
                              <div
                                key={item.id}
                                className="py-2.5 flex items-center justify-between gap-4"
                              >
                                <span className="text-zinc-200">
                                  {item.product_name_fr}
                                  {item.variation_label_fr ? ` (${item.variation_label_fr})` : ''} ×{' '}
                                  {item.quantity}
                                </span>
                                <span className="tabular-nums text-white font-medium">
                                  {formatTnd(item.line_total, lang)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CUSTOMIZATION */}
      {activeTab === 'customization' && settingsDraft && (
        <div className="space-y-8">
          {/* Live Supabase Status Card */}
          <div className="glass-surface rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-zinc-300 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Statut Base de données & Médias Supabase
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Mode actif :{' '}
                  <strong className="text-zinc-200">
                    {overview?.storage_mode === 'supabase'
                      ? 'Supabase PostgreSQL + Storage'
                      : 'SQLite local (repli automatique)'}
                  </strong>
                  {overview?.supabase_error ? ` — ${overview.supabase_error}` : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleTestSupabase()}
              disabled={testingSupabase}
              className="min-h-[40px] px-4 rounded-xl border border-white/15 text-xs font-medium text-white hover:bg-white/[0.08] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {testingSupabase ? 'Test en cours...' : 'Tester la connexion Supabase'}
            </button>
          </div>

          {overview?.storage_mode !== 'supabase' && (
            <div className="glass-surface rounded-2xl p-5 sm:p-6 space-y-2 border border-amber-500/25">
              <h3 className="text-sm font-semibold text-white">
                Configuration Base de données Supabase
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Exécutez le fichier <code className="text-zinc-200">supabase/schema.sql</code> de votre dépôt privé dans l’éditeur SQL de Supabase, puis cliquez sur « Tester la connexion Supabase » ci-dessus.
              </p>
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="glass-surface rounded-2xl p-6 space-y-6">
            <h2 className="text-lg font-semibold text-white">Identité, Hero & Livraison</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">Nom de la marque</span>
                <input
                  type="text"
                  value={settingsDraft.brand_name}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, brand_name: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">Sous-titre du logo</span>
                <input
                  type="text"
                  value={settingsDraft.brand_tagline}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, brand_tagline: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="text-xs text-zinc-400 block">
                  URL Logo personnalisé (laisser vide pour mot-symbole maxPro)
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settingsDraft.logo_url}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, logo_url: e.target.value })
                    }
                    className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                  />
                  <label className="min-h-[42px] px-3 rounded-xl border border-white/15 text-xs text-zinc-200 hover:bg-white/[0.06] inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = await uploadImageFile(file);
                        if (url) setSettingsDraft({ ...settingsDraft, logo_url: url });
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs text-zinc-400 block">Image Hero principale</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settingsDraft.hero_image}
                    onChange={(e) =>
                      setSettingsDraft({ ...settingsDraft, hero_image: e.target.value })
                    }
                    className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                  />
                  <label className="min-h-[42px] px-3 rounded-xl border border-white/15 text-xs text-zinc-200 hover:bg-white/[0.06] inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = await uploadImageFile(file);
                        if (url) setSettingsDraft({ ...settingsDraft, hero_image: url });
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">Titre Hero (FR)</span>
                <input
                  type="text"
                  value={settingsDraft.hero_title_fr}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, hero_title_fr: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">Titre Hero (AR)</span>
                <input
                  type="text"
                  dir="rtl"
                  value={settingsDraft.hero_title_ar}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, hero_title_ar: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">Sous-titre Hero (FR)</span>
                <input
                  type="text"
                  value={settingsDraft.hero_subtitle_fr}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, hero_subtitle_fr: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">Sous-titre Hero (AR)</span>
                <input
                  type="text"
                  dir="rtl"
                  value={settingsDraft.hero_subtitle_ar}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, hero_subtitle_ar: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                />
              </label>
            </div>

            <div className="pt-4 border-t border-white/[0.08] space-y-4">
              <label className="inline-flex items-center gap-2.5 text-sm text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsDraft.promo_enabled}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, promo_enabled: e.target.checked })
                  }
                  className="rounded border-white/20"
                />
                <span>Afficher la bannière d’annonce en haut du site</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={settingsDraft.promo_text_fr}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, promo_text_fr: e.target.value })
                  }
                  placeholder="Texte bannière FR"
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                />
                <input
                  type="text"
                  dir="rtl"
                  value={settingsDraft.promo_text_ar}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, promo_text_ar: e.target.value })
                  }
                  placeholder="نص الإعلان بالعربية"
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-white/[0.08] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">Frais de livraison (TND)</span>
                <input
                  type="number"
                  min={0}
                  value={settingsDraft.shipping_fee}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, shipping_fee: Number(e.target.value) })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white tabular-nums focus:outline-none focus:border-white/30"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">Seuil livraison gratuite (TND)</span>
                <input
                  type="number"
                  min={0}
                  value={settingsDraft.free_shipping_threshold}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      free_shipping_threshold: Number(e.target.value),
                    })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white tabular-nums focus:outline-none focus:border-white/30"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">Email contact</span>
                <input
                  type="email"
                  value={settingsDraft.contact_email}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, contact_email: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">Téléphone</span>
                <input
                  type="text"
                  value={settingsDraft.contact_phone}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, contact_phone: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">WhatsApp (format international)</span>
                <input
                  type="text"
                  value={settingsDraft.contact_whatsapp}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, contact_whatsapp: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-400">Localisation Showroom (FR)</span>
                <input
                  type="text"
                  value={settingsDraft.contact_location_fr}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, contact_location_fr: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white focus:outline-none focus:border-white/30"
                />
              </label>
            </div>

            <div className="pt-4 border-t border-white/[0.08] space-y-3">
              <span className="text-xs font-medium text-zinc-300 block">
                Produits mis en avant sur la page d’accueil
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {products.map((prod) => {
                  const selected = settingsDraft.featured_product_ids.includes(prod.id);
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? settingsDraft.featured_product_ids.filter((id) => id !== prod.id)
                          : [...settingsDraft.featured_product_ids, prod.id];
                        setSettingsDraft({ ...settingsDraft, featured_product_ids: next });
                      }}
                      className={`p-3 rounded-xl border text-start text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-white text-zinc-950 border-white font-medium'
                          : 'bg-black/30 border-white/10 text-zinc-300'
                      }`}
                    >
                      <span className="truncate">{prod.name_fr}</span>
                      {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="min-h-[46px] px-6 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 font-semibold text-sm transition-colors cursor-pointer"
            >
              {savingSettings ? 'Enregistrement...' : 'Enregistrer la personnalisation'}
            </button>
          </form>

          {/* Category Visuals Editor */}
          <div className="glass-surface rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-white">Visuels & Libellés des Catégories</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-4 rounded-xl bg-black/35 border border-white/[0.07] space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-12 rounded-lg overflow-hidden bg-zinc-900 shrink-0">
                      <SafeImage
                        src={cat.image_url}
                        alt={cat.name_fr}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={cat.name_fr}
                        onChange={(e) =>
                          setCategories((prev) =>
                            prev.map((c) => (c.id === cat.id ? { ...c, name_fr: e.target.value } : c))
                          )
                        }
                        className="min-h-[36px] px-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-white"
                      />
                      <input
                        type="text"
                        dir="rtl"
                        value={cat.name_ar}
                        onChange={(e) =>
                          setCategories((prev) =>
                            prev.map((c) => (c.id === cat.id ? { ...c, name_ar: e.target.value } : c))
                          )
                        }
                        className="min-h-[36px] px-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={cat.image_url}
                      onChange={(e) =>
                        setCategories((prev) =>
                          prev.map((c) => (c.id === cat.id ? { ...c, image_url: e.target.value } : c))
                        )
                      }
                      className="flex-1 min-h-[36px] px-2.5 rounded-lg bg-black/50 border border-white/10 text-xs text-zinc-300"
                    />
                    <label className="min-h-[36px] px-2.5 rounded-lg border border-white/10 text-xs text-zinc-200 inline-flex items-center gap-1 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = await uploadImageFile(file);
                          if (url) {
                            setCategories((prev) =>
                              prev.map((c) => (c.id === cat.id ? { ...c, image_url: url } : c))
                            );
                          }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleSaveCategory(cat)}
                      className="min-h-[36px] px-3 rounded-lg bg-white text-zinc-950 text-xs font-semibold cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SECURITY / PASSWORD CHANGE */}
      {activeTab === 'security' && (
        <div className="max-w-xl space-y-6">
          <div className="glass-surface rounded-2xl p-5 sm:p-7 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Identifiant & Mot de passe administrateur
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  Compte connecté :{' '}
                  <strong className="text-white">{authStatus?.username || 'admin'}</strong>
                </p>
              </div>
            </div>

            {authStatus?.envManaged ? (
              <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/35 text-xs sm:text-sm text-amber-100 leading-relaxed">
                L’accès administrateur est actuellement piloté par la variable d’environnement{' '}
                <code className="font-mono">ADMIN_PASSCODE</code> sur le serveur. Pour modifier ce
                mot de passe, mettez à jour <code className="font-mono">ADMIN_PASSCODE</code> dans
                vos paramètres de déploiement.
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                {pwError && (
                  <p className="p-3 rounded-xl bg-red-500/15 border border-red-500/35 text-xs sm:text-sm text-red-100">
                    {pwError}
                  </p>
                )}

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-300">
                    Identifiant administrateur (optionnel)
                  </span>
                  <input
                    type="text"
                    minLength={3}
                    maxLength={64}
                    autoComplete="username"
                    value={pwNewUsername}
                    onChange={(e) => setPwNewUsername(e.target.value)}
                    placeholder={authStatus?.username || 'Identifiant'}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-300">Mot de passe actuel *</span>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-300">
                    Nouveau mot de passe * (12 caractères minimum)
                  </span>
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={pwNext}
                    onChange={(e) => setPwNext(e.target.value)}
                    placeholder="Minimum 12 caractères"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-300">
                    Confirmer le nouveau mot de passe *
                  </span>
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    placeholder="Retapez le nouveau mot de passe"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white/[0.04] border border-white/10 text-base sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                  />
                </label>

                <button
                  type="submit"
                  disabled={pwSaving}
                  className="min-h-[46px] px-6 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-60 font-semibold text-sm transition-colors cursor-pointer"
                >
                  {pwSaving ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* PRODUCT CREATE / EDIT MODAL */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setEditingProduct(null)}
          />
          <form
            onSubmit={handleSaveProduct}
            className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto glass-panel rounded-3xl p-6 sm:p-8 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-white">
                {editingProduct.id ? 'Modifier le produit' : 'Nouveau produit'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-2 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Nom (FR) *</span>
                <input
                  type="text"
                  required
                  value={editingProduct.name_fr || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name_fr: e.target.value })}
                  className="w-full min-h-[40px] px-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Nom (AR)</span>
                <input
                  type="text"
                  dir="rtl"
                  value={editingProduct.name_ar || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name_ar: e.target.value })}
                  className="w-full min-h-[40px] px-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Catégorie *</span>
                <select
                  value={editingProduct.category_slug || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, category_slug: e.target.value })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl bg-zinc-900 border border-white/10 text-base sm:text-sm text-white"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.slug}>
                      {cat.name_fr}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Stock *</span>
                <input
                  type="number"
                  min={0}
                  required
                  value={editingProduct.stock ?? 0}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white tabular-nums"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Prix (TND) *</span>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  required
                  value={editingProduct.price ?? 0}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, price: Number(e.target.value) })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white tabular-nums"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Prix promo (TND, optionnel)</span>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={editingProduct.sale_price ?? ''}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      sale_price: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white tabular-nums"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Résumé (FR)</span>
                <input
                  type="text"
                  value={editingProduct.short_desc_fr || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, short_desc_fr: e.target.value })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Résumé (AR)</span>
                <input
                  type="text"
                  dir="rtl"
                  value={editingProduct.short_desc_ar || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, short_desc_ar: e.target.value })
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Description complète (FR)</span>
                <textarea
                  rows={3}
                  value={editingProduct.description_fr || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, description_fr: e.target.value })
                  }
                  className="w-full p-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Description complète (AR)</span>
                <textarea
                  rows={3}
                  dir="rtl"
                  value={editingProduct.description_ar || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, description_ar: e.target.value })
                  }
                  className="w-full p-3 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white"
                />
              </label>
            </div>

            {/* Images Upload & List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Photos du produit (JPG, PNG, WebP)</span>
                <label className="min-h-[34px] px-3 rounded-lg border border-white/15 text-xs text-white hover:bg-white/[0.08] inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingImage ? 'Envoi...' : 'Téléverser une photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await uploadImageFile(file);
                      if (url) {
                        setEditingProduct((prev) =>
                          prev ? { ...prev, images: [...(prev.images || []), url] } : prev
                        );
                      }
                    }}
                  />
                </label>
              </div>

              <div className="space-y-2">
                {(editingProduct.images || []).map((imgUrl, idx) => (
                  <div key={`${imgUrl}-${idx}`} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={imgUrl}
                      onChange={(e) => {
                        const next = [...(editingProduct.images || [])];
                        next[idx] = e.target.value;
                        setEditingProduct({ ...editingProduct, images: next });
                      }}
                      className="flex-1 min-h-[36px] px-3 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-zinc-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = (editingProduct.images || []).filter((_, i) => i !== idx);
                        setEditingProduct({ ...editingProduct, images: next });
                      }}
                      className="p-1.5 text-zinc-400 hover:text-red-400 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setEditingProduct({
                      ...editingProduct,
                      images: [...(editingProduct.images || []), ''],
                    })
                  }
                  className="text-xs text-zinc-300 hover:text-white cursor-pointer"
                >
                  + Ajouter une URL d’image
                </button>
              </div>
            </div>

            {/* Variations Editor */}
            <div className="space-y-2 pt-2 border-t border-white/[0.08]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">Variations (taille, couleur, version)</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextVar: ProductVariation = {
                      id: `var-${Date.now()}`,
                      label_fr: '',
                      label_ar: '',
                      price_delta: 0,
                    };
                    setEditingProduct({
                      ...editingProduct,
                      variations: [...(editingProduct.variations || []), nextVar],
                    });
                  }}
                  className="text-xs text-zinc-200 hover:text-white cursor-pointer"
                >
                  + Ajouter une variation
                </button>
              </div>
              {(editingProduct.variations || []).map((v, idx) => (
                <div key={v.id} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Libellé FR"
                    value={v.label_fr}
                    onChange={(e) => {
                      const next = [...(editingProduct.variations || [])];
                      next[idx] = { ...next[idx], label_fr: e.target.value };
                      setEditingProduct({ ...editingProduct, variations: next });
                    }}
                    className="col-span-5 min-h-[36px] px-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-white"
                  />
                  <input
                    type="text"
                    dir="rtl"
                    placeholder="التسمية AR"
                    value={v.label_ar}
                    onChange={(e) => {
                      const next = [...(editingProduct.variations || [])];
                      next[idx] = { ...next[idx], label_ar: e.target.value };
                      setEditingProduct({ ...editingProduct, variations: next });
                    }}
                    className="col-span-4 min-h-[36px] px-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-white"
                  />
                  <input
                    type="number"
                    placeholder="+/- TND"
                    value={v.price_delta}
                    onChange={(e) => {
                      const next = [...(editingProduct.variations || [])];
                      next[idx] = { ...next[idx], price_delta: Number(e.target.value) };
                      setEditingProduct({ ...editingProduct, variations: next });
                    }}
                    className="col-span-2 min-h-[36px] px-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-white tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = (editingProduct.variations || []).filter((_, i) => i !== idx);
                      setEditingProduct({ ...editingProduct, variations: next });
                    }}
                    className="col-span-1 p-1.5 text-zinc-400 hover:text-red-400 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 pt-2 border-t border-white/[0.08] text-xs text-zinc-200">
              {(
                [
                  ['is_visible', 'Visible en boutique'],
                  ['is_featured', 'Mis en avant'],
                  ['is_bestseller', 'Meilleure vente'],
                  ['is_new_arrival', 'Nouveauté'],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingProduct[field])}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, [field]: e.target.checked })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="min-h-[42px] px-4 rounded-xl border border-white/15 text-xs text-zinc-300 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingProduct}
                className="min-h-[42px] px-6 rounded-xl bg-white text-zinc-950 font-semibold text-xs sm:text-sm hover:bg-zinc-200 cursor-pointer"
              >
                {savingProduct ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
