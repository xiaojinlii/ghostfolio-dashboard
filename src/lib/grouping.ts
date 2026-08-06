import type { BucketConfig, SidecarConfig } from './config';
import type { PortfolioPosition, Tag } from './types';

export interface BucketAssignment {
  /** Index into the config.buckets array (priority order). */
  index: number;
  config: BucketConfig;
  label: string; // config.name
  desc?: string; // config.desc
  color: string; // config.color or default
  target?: number; // bucket target in percent (0..100)
  assets?: BucketConfig['assets'];
  positions: PortfolioPosition[];
  percentage: number; // sum of allocationInPercentage within bucket (0..1)
}

/** Whether a position is a Ghostfolio CASH/LIQUIDITY position.
 *  Kept exported for callers that need to detect cash specifically; bucket
 *  routing now uses BucketConfig.assetSubClass (see assignBuckets). */
export function isCashPosition(pos: {
  assetProfile?: { assetSubClass?: string; assetClass?: string };
}): boolean {
  return pos.assetProfile?.assetSubClass === 'CASH';
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
 *  - Buckets are walked in config.buckets array order (= priority).
 *    First bucket whose `tag` name appears on the position's own tags wins.
 *  - If no tag matched, a bucket whose `assetSubClass` array contains the
 *    position's assetProfile.assetSubClass wins (priority order). This is how
 *    CASH positions route to the cash bucket — synthetic cash positions have
 *    no activities, so they can't be tagged.
 *  - Positions matching no bucket go to "untracked".
 *  - Bucket percentage = sum of allocationInPercentage of its positions.
 *    allocationInPercentage is already "holding value / portfolio total"
 *    (portfolio.service.ts:634), so all buckets + untracked sum to ~1.0.
 */
export function assignBuckets(
  positions: PortfolioPosition[],
  config: SidecarConfig
): BucketAssignment[] {
  const bucketConfigs = config.buckets ?? [];

  const buckets: BucketAssignment[] = bucketConfigs.map((cfg, i) => ({
    index: i,
    config: cfg,
    label: cfg.name,
    desc: cfg.desc,
    color: cfg.color ?? '215 16% 47%',
    target: cfg.target,
    assets: cfg.assets,
    positions: [] as PortfolioPosition[],
    percentage: 0
  }));

  const untracked: BucketAssignment = {
    index: -1,
    config: { name: '未分类', tag: '' },
    label: '未分类',
    desc: undefined,
    color: '215 16% 47%',
    target: undefined,
    assets: undefined,
    positions: [] as PortfolioPosition[],
    percentage: 0
  };

  for (const pos of positions) {
    let assigned: BucketAssignment | null = null;

    // 1. Match by tag name against the position's own tags (priority order).
    for (const b of buckets) {
      const tagName = b.config.tag?.trim();
      if (tagName && pos.tags?.some((t) => t.name === tagName)) {
        assigned = b;
        break;
      }
    }

    // 2. Match by assetSubClass when no tag bucket claimed it (priority order).
    //    CASH positions (and any synthetic, untaggable position) route here.
    if (!assigned) {
      const sub = pos.assetProfile?.assetSubClass;
      if (sub) {
        for (const b of buckets) {
          const subs = b.config.assetSubClass;
          if (subs && subs.includes(sub)) {
            assigned = b;
            break;
          }
        }
      }
    }

    // 3. Otherwise untracked.
    if (!assigned) {
      assigned = untracked;
    }

    assigned.positions.push(pos);
    assigned.percentage += pos.allocationInPercentage ?? 0;
  }

  // Sort each bucket's positions by allocation descending.
  for (const b of [...buckets, untracked]) {
    b.positions.sort(
      (a, c) => (c.allocationInPercentage ?? 0) - (a.allocationInPercentage ?? 0)
    );
  }

  // Buckets in array (priority) order, then untracked last.
  return [...buckets, untracked];
}

/** Check whether a bucket's configured tag name is present among the given
 *  tags. Used by the settings UI to show "已匹配 / 未匹配". */
export function isBucketTagPresent(
  bucket: { tag?: string },
  tags: Tag[]
): boolean {
  const name = bucket.tag?.trim();
  if (!name) return false;
  return tags.some((t) => t.name === name);
}
