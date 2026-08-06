import type { PortfolioPosition, Tag } from './types';
import {
  BUCKET_COLORS,
  BUCKET_IDS,
  BUCKET_LABELS,
  type BucketId,
  type SidecarConfig
} from './config';

export interface BucketAssignment {
  id: BucketId | 'untracked';
  label: string;
  color: string; // hsl triplet string, e.g. "222 47% 11%"
  positions: PortfolioPosition[];
  percentage: number; // sum of allocationInPercentage within bucket (0..1)
}

export function isCashPosition(pos: {
  assetProfile?: { assetSubClass?: string; assetClass?: string };
}): boolean {
  return pos.assetProfile?.assetSubClass === 'CASH';
}

/**
 * Check whether a bucket's configured tag name is present among the given
 * tags. Used by the settings UI to show "已匹配 / 未匹配" — matching by name
 * against whatever tags the user passes in (typically collected from the
 * holdings themselves, avoiding the ADMIN-only GET /tags endpoint).
 */
export function isBucketTagPresent(
  config: SidecarConfig,
  id: BucketId,
  tags: Tag[]
): boolean {
  const name = config.buckets[id]?.trim();
  if (!name) return false;
  return tags.some((t) => t.name === name);
}

/**
 * Collect the distinct tags carried by the given positions. Each holding
 * already embeds its own tags (PortfolioPosition.tags), so we never need
 * GET /tags — which is ADMIN-only (readTags) and 403s for normal users.
 */
export function collectTags(positions: PortfolioPosition[]): Tag[] {
  const map = new Map<string, Tag>();
  for (const p of positions) {
    for (const t of p.tags ?? []) {
      if (!map.has(t.id)) map.set(t.id, t);
    }
  }
  return Array.from(map.values());
}

/**
 * Assign each position to exactly one bucket (mutual exclusion).
 *
 * Rules:
 *  - If autoCashBucket is enabled and the position is a CASH/LIQUIDITY
 *    position, the cash bucket wins regardless of tags. Cash positions are
 *    synthetic account balances with no activities, so you cannot tag them
 *    via PUT /holding/.../tags (it would 404).
 *  - Otherwise walk buckets in config.priority order; first bucket whose
 *    configured tag NAME appears on the position's own tags wins. Matching
 *    by name avoids any dependency on the ADMIN-only /tags endpoint.
 *  - Positions matching no bucket go to "untracked".
 *  - Bucket percentage = sum of allocationInPercentage of its positions.
 *    allocationInPercentage is already "holding value / portfolio total"
 *    (portfolio.service.ts:634), so all buckets + untracked sum to ~1.0.
 */
export function assignBuckets(
  positions: PortfolioPosition[],
  config: SidecarConfig
): BucketAssignment[] {
  const buckets: BucketAssignment[] = [
    ...BUCKET_IDS.map((id) => ({
      id,
      label: BUCKET_LABELS[id],
      color: BUCKET_COLORS[id],
      positions: [] as PortfolioPosition[],
      percentage: 0
    })),
    {
      id: 'untracked',
      label: '未分类',
      color: '215 16% 47%',
      positions: [] as PortfolioPosition[],
      percentage: 0
    }
  ];

  const findBucket = (bid: BucketId) => buckets.find((b) => b.id === bid)!;
  const untracked = buckets[buckets.length - 1]!;

  for (const pos of positions) {
    let assigned: BucketAssignment | null = null;

    if (config.autoCashBucket && isCashPosition(pos)) {
      assigned = findBucket('cash');
    }

    if (!assigned) {
      for (const bid of config.priority) {
        const tagName = config.buckets[bid]?.trim();
        if (
          tagName &&
          pos.tags?.some((t) => t.name === tagName)
        ) {
          assigned = findBucket(bid);
          break;
        }
      }
    }

    if (!assigned) {
      assigned = untracked;
    }

    assigned.positions.push(pos);
    assigned.percentage += pos.allocationInPercentage ?? 0;
  }

  // Sort each bucket's positions by allocation descending.
  for (const b of buckets) {
    b.positions.sort(
      (a, c) => (c.allocationInPercentage ?? 0) - (a.allocationInPercentage ?? 0)
    );
  }

  // Buckets in config.priority order, then untracked last.
  const ordered: BucketAssignment[] = [
    ...config.priority.map((bid) => findBucket(bid)),
    untracked
  ];

  return ordered;
}
