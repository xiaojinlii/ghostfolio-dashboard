// Sidecar configuration model.
//
// Two layers of config:
//   1. config.json (persisted via the dev-server /sidecar/config endpoint):
//      bucket definitions only. Read on startup, written from the Settings
//      panel. This is the user-facing, shareable layout.
//   2. Environment (GHOSTFOLIO_URL): the Ghostfolio base URL, injected at
//      build/dev time. Kept out of config.json because it's an environment
//      concern, not a portfolio layout concern. Empty = same-origin /api/v1.
//   3. localStorage: the Security Token only (a credential — must not be
//      committed to a config file).//
// Note: "auto cash bucket" is NOT a persisted toggle. A bucket absorbs CASH
// positions when its `assetSubClass` array contains 'CASH' (and no prior
// bucket matched by tag). Synthetic cash positions have no activities, so
// they can't be tagged — assetSubClass is how they're routed.

export type BucketId = string;

/** A single asset target within a bucket (optional — if absent, the bucket
 *  doesn't enforce per-asset targets). */
export interface AssetTarget {
  name: string; // display/symbol name, matched against holding assetProfile.name or symbol
  target: number; // target allocation in percent (0..100) within the bucket
}

/** A bucket definition as stored in config.json. Array order = bucket
 *  priority for mutual-exclusion assignment. */
export interface BucketConfig {
  /** Display name shown on the card header (e.g. "核心仓"). */
  name: string;
  /** Ghostfolio tag name to match against position.tags[] (e.g. "📈 核心仓"). */
  tag: string;
  /** Short description shown after the bucket name. */
  desc?: string;
  /** Target allocation of this bucket within the whole portfolio (percent 0..100). */
  target?: number;
  /** Per-asset targets within the bucket. Optional; if absent, no per-asset control. */
  assets?: AssetTarget[];
  /** hsl() triplet string (e.g. "199 89% 48%") for the bucket's accent color. */
  color?: string;
  /**
   * Ghostfolio assetSubClass values this bucket absorbs (e.g. ['CASH']).
   * Positions whose assetProfile.assetSubClass is in this list route here
   * when no tag matched. Lets a bucket collect CASH/LIQUIDITY without a tag
   * (synthetic cash positions have no activities, so they can't be tagged).
   */
  assetSubClass?: string[];
}

/** Shape of config.json on disk — bucket definitions only. */
export interface SidecarConfig {
  /** Buckets in priority order. */
  buckets: BucketConfig[];
}

export const DEFAULT_CONFIG: SidecarConfig = {
  buckets: [
    {
      name: '核心仓',
      tag: '📈 核心仓',
      desc: '长期复利，获取全球经济增长',
      target: 75,
      assets: [
        { name: 'VWRA', target: 65 },
        { name: 'AVGS', target: 10 }
      ],
      color: '199 89% 48%'
    },
    {
      name: '对冲仓',
      tag: '🛡 对冲仓',
      desc: '对冲法币风险、极端风险',
      target: 10,
      assets: [
        { name: 'IBIT', target: 5 },
        { name: 'GLDM', target: 5 }
      ],
      color: '221 83% 53%'
    },
    {
      name: '认知仓',
      tag: '🧠 认知仓',
      desc: '验证认知，获取超额收益',
      target: 5,
      color: '262 83% 58%'
    },
    {
      name: '现金仓',
      tag: '💵 现金仓',
      desc: '流动性、等待机会',
      target: 10,
      assetSubClass: ['CASH'],
      color: '142 71% 45%'
    }
  ]
};

/**
 * Ghostfolio base URL from the environment (GHOSTFOLIO_URL).
 * Empty = same-origin "/api/v1" (Vite proxy in dev, reverse proxy in prod).
 * Read once at module load — changing it requires a dev-server restart.
 */
export const GHOSTFOLIO_URL: string =
  (import.meta.env.GHOSTFOLIO_URL as string | undefined)?.trim() ?? '';

// --- Security Token (credential, localStorage only) ------------------------

const TOKEN_KEY = 'ghostfolio-sidecar-security-token';

export function loadSecurityToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveSecurityToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearSecurityToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// --- JWT (authToken) session storage ----------------------------------------

const AUTH_TOKEN_KEY = 'ghostfolio-sidecar-auth-token';

export function loadAuthToken(): string | null {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveAuthToken(token: string) {
  try {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearAuthToken() {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
}
