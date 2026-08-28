// Sidecar configuration model.
//
// Three layers of config:
//   1. config.json (persisted via the dev-server /sidecar/config endpoint):
//      bucket + per-asset definitions, including target allocations and
//      tolerance bands. Read on startup, written from the Settings panel.
//      This is the user-facing, shareable layout.
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

/**
 * Optional per-asset / per-bucket threshold override. Every field is optional;
 * a field left undefined falls back to the 5/25 rule default for that bound.
 * All values are in percentage points (0..100). They are ABSOLUTE bounds on the
 * asset's share of the whole portfolio (same unit as `target`), not relative.
 *
 *   toleranceLower / toleranceUpper — the "容忍区间" (Layer 1 / Layer 2 band).
 *     Outside this band → drifted (warning), a rebalance is suggested.
 *   eventLower / eventUpper — the "事件触发线" (a stricter outer guard, e.g.
 *     band ×0.8 / ×1.2). Crossed → event severity, surfaced prominently.
 *
 * Leave a bound undefined to derive it from the target via the 5/25 rule:
 *   tolerance = ±min(5, target×0.25)
 *   event     = tolerance ×0.8 (lower) / ×1.2 (upper) from the target
 * Set a bound to a number to pin it. Set to 0 to allow "no lower bound".
 */
export interface ThresholdOverride {
  toleranceLower?: number;
  toleranceUpper?: number;
  eventLower?: number;
  eventUpper?: number;
}

/** A single asset target within a bucket (optional — if absent, the bucket
 *  doesn't enforce per-asset targets).
 *
 *  `target` is the asset's target share of the WHOLE PORTFOLIO in percent
 *  (0..100) — same unit as the bucket's `target`, and the assets within a
 *  bucket should sum to that bucket's target. */
export interface AssetTarget extends ThresholdOverride {
  name: string; // display/symbol name, matched against holding assetProfile.name or symbol
  target: number; // target allocation in percent (0..100) within the bucket
}

/** A bucket definition as stored in config.json. Array order = bucket
 *  priority for mutual-exclusion assignment. */
export interface BucketConfig extends ThresholdOverride {
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

// Targets and tolerance bands mirror the user's rebalance policy:
//   核心仓 80% (VWRA 70 + AVGS 10), 对冲仓 10% (GLDM 5 + IBIT 5),
//   认知仓 5%, 现金仓 5%.
// Threshold overrides are pinned to the spec's explicit numbers so the shipped
// config matches the policy exactly, independent of the 5/25 default formula.
// IBIT is the single exception to the 5/25 rule: ±50% relative (2.5–7.5),
// event 2/9 — pinned, do not recompute from 5/25.
export const DEFAULT_CONFIG: SidecarConfig = {
  buckets: [
    {
      name: '核心仓',
      tag: '📈 核心仓',
      desc: '长期复利，获取全球经济增长',
      target: 80,
      // 大类: tolerance 75–85, no event line (drifts slowly, quarterly check).
      toleranceLower: 75,
      toleranceUpper: 85,
      assets: [
        {
          name: 'VWRA',
          target: 70,
          toleranceLower: 65,
          toleranceUpper: 75,
          eventLower: 52,
          eventUpper: 90
        },
        {
          name: 'AVGS',
          target: 10,
          toleranceLower: 7.5,
          toleranceUpper: 12.5,
          eventLower: 6,
          eventUpper: 15
        }
      ],
      color: '199 89% 48%'
    },
    {
      name: '对冲仓',
      tag: '🛡 对冲仓',
      desc: '对冲法币风险、极端风险',
      target: 10,
      toleranceLower: 7.5,
      toleranceUpper: 12.5,
      eventLower: 6,
      eventUpper: 15,
      assets: [
        {
          name: 'GLDM',
          target: 5,
          toleranceLower: 3.75,
          toleranceUpper: 6.25,
          eventLower: 3,
          eventUpper: 7.5
        },
        {
          name: 'IBIT',
          target: 5,
          // ±50% relative — the one exception to 5/25. Pinned, not recomputed.
          toleranceLower: 2.5,
          toleranceUpper: 7.5,
          eventLower: 2,
          eventUpper: 9
        }
      ],
      color: '221 83% 53%'
    },
    {
      name: '认知仓',
      tag: '🧠 认知仓',
      desc: '验证认知，获取超额收益',
      target: 5,
      // 仅上限：下限 0（空仓合规），事件下限不设。
      toleranceLower: 0,
      toleranceUpper: 7.5,
      eventUpper: 9,
      color: '262 83% 58%'
    },
    {
      name: '现金仓',
      tag: '💵 现金仓',
      desc: '流动性、等待机会',
      target: 5,
      toleranceLower: 3.75,
      toleranceUpper: 6.25,
      eventLower: 3,
      eventUpper: 7.5,
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
