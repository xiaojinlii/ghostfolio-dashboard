// Local configuration + persistence for the sidecar app.
// The Security Token (used to log in) and bucket mapping live in localStorage
// so the app stays a single static bundle with zero server state.
//
// Auth model (mirrors the official web client):
//   securityToken  --POST /auth/anonymous-->  authToken (JWT)
// The JWT is attached as "Authorization: Bearer <jwt>" to every data call.
// We persist the Security Token (long-lived) and keep the JWT only in
// memory / sessionStorage so a page refresh re-derives it.

export const BUCKET_IDS = ['core', 'hedge', 'thesis', 'cash'] as const;
export type BucketId = (typeof BUCKET_IDS)[number];

export const BUCKET_LABELS: Record<BucketId, string> = {
  core: '核心仓',
  hedge: '对冲仓',
  thesis: '认知仓',
  cash: '现金仓'
};

// Distinct color per bucket for the progress bars and accents.
// Bare HSL triplet strings (no hsl() wrapper) — consumers wrap with hsl().
export const BUCKET_COLORS: Record<BucketId, string> = {
  core: '199 89% 48%', // sky blue — distinct from hedge's indigo blue
  hedge: '221 83% 53%', // indigo blue
  thesis: '262 83% 58%', // violet
  cash: '142 71% 45%' // green
};

export interface SidecarConfig {
  // Ghostfolio "Security Token" (User.accessToken). Used once to derive a JWT
  // via POST /api/v1/auth/anonymous. Long-lived; persisted so refresh works.
  securityToken: string;
  // Base URL of the Ghostfolio instance, e.g. "http://192.168.1.5:3333" or
  // "https://gf.example.com". Empty = same-origin relative path "/api/v1"
  // (handled by the Vite proxy in dev, or a reverse proxy in prod).
  ghostfolioUrl: string;
  // Map each bucket to a Ghostfolio tag name. A bucket is "active" when its
  // tagName is non-empty and resolves to a real tag id at runtime.
  buckets: Record<BucketId, string>;
  // Bucket priority for mutual exclusion when a position matches several
  // buckets' tags. First match wins.
  priority: BucketId[];
  // When true, positions whose assetSubClass is CASH (or assetClass is
  // LIQUIDITY) are auto-assigned to the cash bucket without needing a tag.
  autoCashBucket: boolean;
}

export const DEFAULT_CONFIG: SidecarConfig = {
  securityToken: '',
  ghostfolioUrl: '',
  buckets: {
    core: '核心仓',
    hedge: '对冲仓',
    thesis: '认知仓',
    cash: '现金仓'
  },
  priority: ['core', 'hedge', 'thesis', 'cash'],
  autoCashBucket: true
};

const STORAGE_KEY = 'ghostfolio-sidecar-config';

export function loadConfig(): SidecarConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SidecarConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      buckets: { ...DEFAULT_CONFIG.buckets, ...(parsed.buckets ?? {}) },
      priority: parsed.priority?.length ? parsed.priority : DEFAULT_CONFIG.priority
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: SidecarConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// --- JWT (authToken) session storage --------------------------------------
// Kept in sessionStorage (cleared when the tab closes) rather than
// localStorage: a JWT is short-lived and per-session. We re-derive it from
// the Security Token on next visit.

const TOKEN_KEY = 'ghostfolio-sidecar-auth-token';

export function loadAuthToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveAuthToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore quota / privacy errors
  }
}

export function clearAuthToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}
