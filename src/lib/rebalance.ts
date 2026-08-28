// Rebalance suggestion computation — pure logic, no React.
//
// Implements a two-layer 5/25 rule with configurable tolerance bands:
//
//   Layer 1 (single-asset): each asset with a `target` is bounded by its
//     own tolerance band (容忍区间). Outside the band → drifted; crossed the
//     event line (事件触发线) → event. A drifted/event asset is driven back
//     to its target with a concrete trade.
//
//   Layer 2 (asset-class / bucket): when a bucket is outside its own band
//     BUT every sub-asset is still compliant, the whole bucket is rebalanced
//     by pushing each sub-asset back to its own target (per the policy:
//     "大类出界但单资产均合规 → 该大类全部子资产调回各自目标").
//
// Thresholds: each asset/bucket may override any of the four bounds
// (toleranceLower/Upper, eventLower/Upper). A bound left undefined is
// derived from the target via the 5/25 default:
//   tolerance = ±min(5, target × 0.25)
//   event     = target ∓ tolerance × {0.8 lower / 1.2 upper}
// IBIT is the single pinned exception (±50% relative); that lives in config,
// not here.
//
// Funding: buys are net-funded by sells within the same bucket when possible
// (self-balancing). A net under-target bucket needs external funding — we
// surface it as a buy with no matching sell; in a whole-portfolio view that's
// funded by the over-target buckets' sells.

import type { BucketAssignment } from './grouping';
import type { PortfolioPosition } from './types';
import type { AssetTarget, ThresholdOverride } from './config';

/** Minimum trade size in base currency. Below this we don't bother. */
const MIN_TRADE = 1;

/** Minimum drift in percentage points (0..100) to suggest a trade. */
const MIN_DRIFT_PCT = 0.05;

// --- 5/25 default threshold constants -------------------------------------

/** Absolute-deviation cap (percentage points) in the 5/25 rule. */
const ABSOLUTE_BAND = 5;
/** Relative-deviation fraction in the 5/25 rule (25% of target). */
const RELATIVE_BAND = 0.25;
/** Event line = tolerance × this factor, measured from the target (lower). */
const EVENT_LOWER_FACTOR = 0.8;
/** Event line = tolerance × this factor, measured from the target (upper). */
const EVENT_UPPER_FACTOR = 1.2;

export type SuggestionSide = 'buy' | 'sell';

/** Severity of a rebalance nudge. `compliant` produces no trade. */
export type Severity = 'compliant' | 'drifted' | 'event';

/** Which layer produced this trade. */
export type TradeLayer = 'asset' | 'class';

/** A single concrete trade. `bucketIndex`/`bucketLabel` identify the bucket;
 *  `symbol`/`name` identify the holding (undefined = bucket-level lump). */
export interface RebalanceTrade {
  side: SuggestionSide;
  bucketIndex: number;
  bucketLabel: string;
  symbol?: string;
  name?: string;
  amount: number; // base currency, always positive
  severity: Severity;
  layer: TradeLayer;
}

/** A bucket's rebalance plan: the sells and buys that move it to target. */
export interface BucketRebalance {
  index: number;
  label: string;
  /** Current allocation of the bucket, in percent (0..100). */
  actualPct: number;
  /** Target allocation of the bucket, in percent (0..100). Undefined when the
   *  bucket has no target configured. */
  targetPct?: number;
  /** Resolved Layer-2 threshold bounds for the bucket (for display). */
  thresholds?: Thresholds;
  /** Current vs target in percentage points. Positive = over. */
  driftPct: number;
  /** Net bucket-level dollar move: positive = sell (over), negative = buy. */
  netAmount: number;
  trades: RebalanceTrade[];
  /** Bucket-level compliance status (Layer 2). */
  status: Severity;
}

/** Net summary across the portfolio: total to sell, total to buy, and the
 *  unfunded portion (buys not covered by sells — needs external cash). */
export interface RebalanceSummary {
  buckets: BucketRebalance[];
  totalSell: number;
  totalBuy: number;
  /** Buys not covered by sells. > 0 means external cash needed. */
  unfunded: number;
}

/** Resolved tolerance bounds for one asset or bucket. All four are concrete
 *  numbers in percent (0..100); `null` means "no bound on this side"
 *  (e.g. 认知仓 has no lower bound — empty is compliant). */
export interface Thresholds {
  toleranceLower: number | null;
  toleranceUpper: number | null;
  eventLower: number | null;
  eventUpper: number | null;
}

/**
 * Resolve the four threshold bounds for a target + optional override.
 *
 * Default (5/25): tolerance = ±min(ABSOLUTE_BAND, target × RELATIVE_BAND),
 * event = target ∓ tolerance × {0.8 / 1.2}. Any override field that is a
 * number (including 0) pins that bound; `undefined` keeps the default.
 *
 * A target of 0 yields a lower bound of 0 (can't go below nothing) and an
 * upper bound derived normally — this is the 认知仓 "only upper limit" case
 * when combined with toleranceLower: 0.
 */
export function resolveThresholds(
  target: number,
  override?: ThresholdOverride
): Thresholds {
  const tol = Math.min(ABSOLUTE_BAND, target * RELATIVE_BAND);

  const toleranceLower =
    override?.toleranceLower !== undefined
      ? override.toleranceLower
      : Math.max(0, target - tol);
  const toleranceUpper =
    override?.toleranceUpper !== undefined
      ? override.toleranceUpper
      : target + tol;

  // Event lines default to the tolerance band scaled by 0.8 / 1.2 from the
  // target. When a tolerance bound is null (no lower bound), its event line
  // is null too.
  const eventLower =
    override?.eventLower !== undefined
      ? override.eventLower
      : toleranceLower === null
        ? null
        : target - tol * EVENT_LOWER_FACTOR;
  const eventUpper =
    override?.eventUpper !== undefined
      ? override.eventUpper
      : toleranceUpper === null
        ? null
        : target + tol * EVENT_UPPER_FACTOR;

  return { toleranceLower, toleranceUpper, eventLower, eventUpper };
}

/**
 * Classify an actual value against resolved thresholds.
 *   compliant — inside the tolerance band (or on its boundary).
 *   drifted   — outside the band but inside the event line.
 *   event     — outside the event line (or the band, when no event line set).
 *
 * A bound of `null` means "no limit on this side" → always compliant there.
 */
export function statusOf(actual: number, t: Thresholds): Severity {
  const belowTolerance =
    t.toleranceLower === null || actual >= t.toleranceLower;
  const aboveTolerance =
    t.toleranceUpper === null || actual <= t.toleranceUpper;
  if (belowTolerance && aboveTolerance) return 'compliant';

  // Outside the band. If an event line exists on the breached side, crossing
  // it escalates to event; otherwise the band breach itself is an event.
  const belowEvent = t.eventLower === null || actual >= t.eventLower;
  const aboveEvent = t.eventUpper === null || actual <= t.eventUpper;
  if (!belowEvent || !aboveEvent) return 'event';
  return 'drifted';
}

/**
 * Match a configured asset target to a position by symbol or assetProfile.name.
 * Same matching rule BucketCard uses (findAssetTarget), extracted here so the
 * suggestion logic and the card agree on which position a target refers to.
 */
function matchAssetTarget(
  assets: AssetTarget[],
  pos: PortfolioPosition
): AssetTarget | undefined {
  const sym = pos.assetProfile.symbol;
  const name = pos.assetProfile.name;
  return assets.find((a) => a.name === sym || a.name === name);
}

/**
 * Compute rebalance suggestions for the given bucket assignments.
 *
 * `totalValue` is the portfolio total in base currency (the denominator for
 * converting bucket percentages to dollar amounts). When undefined, no dollar
 * suggestions can be made and an empty summary is returned.
 *
 * The function is deterministic and side-effect free.
 */
export function computeRebalance(
  buckets: BucketAssignment[],
  totalValue: number | undefined
): RebalanceSummary {
  if (!totalValue || totalValue <= 0) {
    return { buckets: [], totalSell: 0, totalBuy: 0, unfunded: 0 };
  }

  const result: BucketRebalance[] = [];
  let totalSell = 0;
  let totalBuy = 0;

  for (const b of buckets) {
    if (b.index < 0) continue; // skip untracked

    const targetPct = b.target; // 0..100
    if (targetPct === undefined) {
      // No target → no rebalance plan for this bucket.
      result.push({
        index: b.index,
        label: b.label,
        actualPct: b.percentage * 100,
        targetPct: undefined,
        thresholds: undefined,
        driftPct: 0,
        netAmount: 0,
        trades: [],
        status: 'compliant'
      });
      continue;
    }

    const actualPct = b.percentage * 100; // 0..100
    const driftPct = actualPct - targetPct;
    const targetValue = (targetPct / 100) * totalValue;
    const actualValue = b.percentage * totalValue;
    const netAmount = actualValue - targetValue; // +over/-under

    const trades: RebalanceTrade[] = [];

    if (b.assets && b.assets.length > 0) {
      // --- Layer 1: per-asset rebalance ---
      // Each asset with a target is driven toward its own target. AssetTarget
      // .target is a percent OF THE PORTFOLIO (VWRA 70 = 70% of total), so
      // target value = (target/100) * total. An asset only generates a trade
      // when its actual share breaches its tolerance band (status != compliant)
      // AND the dollar move is material.
      const assetStatuses: Severity[] = [];

      for (const pos of b.positions) {
        const at = matchAssetTarget(b.assets, pos);
        if (!at) continue;

        // asset share of the WHOLE portfolio, in percent (0..100)
        const assetActualPct =
          ((pos.valueInBaseCurrency ?? 0) / totalValue) * 100;
        const thr = resolveThresholds(at.target, at);
        const status = statusOf(assetActualPct, thr);
        assetStatuses.push(status);

        if (status === 'compliant') continue;
        const assetTargetValue = (at.target / 100) * totalValue;
        const assetActualValue = pos.valueInBaseCurrency ?? 0;
        const diff = assetActualValue - assetTargetValue; // +over/-under

        if (Math.abs(diff) < MIN_TRADE) continue;

        if (diff > 0) {
          trades.push({
            side: 'sell',
            bucketIndex: b.index,
            bucketLabel: b.label,
            symbol: pos.assetProfile.symbol,
            name: pos.assetProfile.name ?? pos.assetProfile.symbol,
            amount: diff,
            severity: status,
            layer: 'asset'
          });
          totalSell += diff;
        } else {
          trades.push({
            side: 'buy',
            bucketIndex: b.index,
            bucketLabel: b.label,
            symbol: pos.assetProfile.symbol,
            name: pos.assetProfile.name ?? pos.assetProfile.symbol,
            amount: -diff,
            severity: status,
            layer: 'asset'
          });
          totalBuy += -diff;
        }
      }

      // --- Layer 2: bucket-out fallback ---
      // The bucket itself is outside its band, but every sub-asset was
      // compliant → push every sub-asset back to its own target (per policy).
      // This also covers the "bucket drifts as a whole" case where no single
      // asset tripped its own band.
      const bucketThr = resolveThresholds(targetPct, b.config);
      const bucketStatus = statusOf(actualPct, bucketThr);
      const allAssetsCompliant = assetStatuses.every(
        (s) => s === 'compliant'
      );

      if (
        bucketStatus !== 'compliant' &&
        allAssetsCompliant &&
        Math.abs(driftPct) >= MIN_DRIFT_PCT
      ) {
        for (const pos of b.positions) {
          const at = matchAssetTarget(b.assets, pos);
          if (!at) continue;

          const assetTargetValue = (at.target / 100) * totalValue;
          const assetActualValue = pos.valueInBaseCurrency ?? 0;
          const diff = assetActualValue - assetTargetValue;
          if (Math.abs(diff) < MIN_TRADE) continue;

          if (diff > 0) {
            trades.push({
              side: 'sell',
              bucketIndex: b.index,
              bucketLabel: b.label,
              symbol: pos.assetProfile.symbol,
              name: pos.assetProfile.name ?? pos.assetProfile.symbol,
              amount: diff,
              severity: bucketStatus,
              layer: 'class'
            });
            totalSell += diff;
          } else {
            trades.push({
              side: 'buy',
              bucketIndex: b.index,
              bucketLabel: b.label,
              symbol: pos.assetProfile.symbol,
              name: pos.assetProfile.name ?? pos.assetProfile.symbol,
              amount: -diff,
              severity: bucketStatus,
              layer: 'class'
            });
            totalBuy += -diff;
          }
        }
      }

      // Edge case: target set, assets configured, but none of the holdings
      // match a target AND the bucket is off. Fall back to a bucket-level lump
      // so the user still sees the imbalance.
      if (trades.length === 0 && Math.abs(netAmount) >= MIN_TRADE) {
        const severity =
          bucketStatus === 'compliant' ? 'drifted' : bucketStatus;
        if (netAmount > 0) {
          trades.push({
            side: 'sell',
            bucketIndex: b.index,
            bucketLabel: b.label,
            amount: netAmount,
            severity,
            layer: 'class'
          });
          totalSell += netAmount;
        } else {
          trades.push({
            side: 'buy',
            bucketIndex: b.index,
            bucketLabel: b.label,
            amount: -netAmount,
            severity,
            layer: 'class'
          });
          totalBuy += -netAmount;
        }
      }
    } else {
      // --- Bucket-level rebalance (no per-asset targets) ---
      // The bucket is one lump. Only suggest when the drift breaches the
      // bucket's own tolerance band, to avoid noise.
      const bucketThr = resolveThresholds(targetPct, b.config);
      const status = statusOf(actualPct, bucketThr);

      if (status === 'compliant' || Math.abs(driftPct) < MIN_DRIFT_PCT) {
        result.push({
          index: b.index,
          label: b.label,
          actualPct,
          targetPct,
          thresholds: bucketThr,
          driftPct,
          netAmount,
          trades: [],
          status
        });
        continue;
      }

      if (Math.abs(netAmount) < MIN_TRADE) {
        result.push({
          index: b.index,
          label: b.label,
          actualPct,
          targetPct,
          thresholds: bucketThr,
          driftPct,
          netAmount,
          trades: [],
          status
        });
        continue;
      }

      if (netAmount > 0) {
        trades.push({
          side: 'sell',
          bucketIndex: b.index,
          bucketLabel: b.label,
          amount: netAmount,
          severity: status,
          layer: 'class'
        });
        totalSell += netAmount;
      } else {
        trades.push({
          side: 'buy',
          bucketIndex: b.index,
          bucketLabel: b.label,
          amount: -netAmount,
          severity: status,
          layer: 'class'
        });
        totalBuy += -netAmount;
      }

      result.push({
        index: b.index,
        label: b.label,
        actualPct,
        targetPct,
        thresholds: bucketThr,
        driftPct,
        netAmount,
        trades,
        status
      });
      continue;
    }

    // Common push for the asset-level branch.
    const bucketThr = resolveThresholds(targetPct, b.config);
    const bucketStatus = statusOf(actualPct, bucketThr);
    result.push({
      index: b.index,
      label: b.label,
      actualPct,
      targetPct,
      thresholds: bucketThr,
      driftPct,
      netAmount,
      trades,
      status: bucketStatus
    });
  }

  const unfunded = Math.max(0, totalBuy - totalSell);

  return {
    buckets: result,
    totalSell,
    totalBuy,
    unfunded
  };
}
