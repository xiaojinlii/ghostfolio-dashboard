import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, Scale } from 'lucide-react';

import type { BucketAssignment } from '@/lib/grouping';
import { computeRebalance, type Severity } from '@/lib/rebalance';
import { cn, fmtMoney } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface RebalanceCardProps {
  buckets: BucketAssignment[];
  totalValue?: number;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  compliant: '合规',
  drifted: '偏离',
  event: '事件'
};

const SEVERITY_BADGE_CLASS: Record<Severity, string> = {
  compliant: 'border-transparent bg-muted text-muted-foreground',
  drifted: 'border-amber-300 bg-amber-100 text-amber-800',
  event: 'border-red-300 bg-red-100 text-red-800'
};

/** A rebalance card is only useful when there's something to act on. We render
 *  nothing if every bucket is on target (within rounding) — an empty "you're
 *  balanced" card would just be noise. Callers can still force-show by always
 *  mounting the component; the empty case returns null. */
export function RebalanceCard({ buckets, totalValue }: RebalanceCardProps) {
  const summary = useMemo(
    () => computeRebalance(buckets, totalValue),
    [buckets, totalValue]
  );

  // Only buckets with trades need a panel.
  const activeBuckets = summary.buckets.filter((b) => b.trades.length > 0);

  if (activeBuckets.length === 0) return null;

  // Aggregate buys/sells across all buckets for the summary footer.
  const sells = activeBuckets.flatMap((b) =>
    b.trades.filter((t) => t.side === 'sell')
  );
  const buys = activeBuckets.flatMap((b) =>
    b.trades.filter((t) => t.side === 'buy')
  );

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <Scale className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">再平衡建议</h2>
        <span className="ml-auto text-[10px] text-muted-foreground">
          5/25 规则 · 单资产 / 大类双层
        </span>
      </div>

      {/* Per-bucket context strip — current vs target, tolerance band, status.
          Gives the "why" behind the trades below at a glance. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-xs">
        {activeBuckets.map((b) => {
          const over = b.driftPct > 0;
          const muted = Math.abs(b.driftPct) < 1;
          const target = b.targetPct;
          const thr = b.thresholds;
          const status = b.status;
          return (
            <span
              key={b.index}
              className="inline-flex items-center gap-1.5 tabular-nums"
            >
              <span className="text-muted-foreground">{b.label}</span>
              <span className="font-medium">
                {b.actualPct.toFixed(2)}%
                {target !== undefined && (
                  <span className="text-muted-foreground">
                    {' '}/ {target.toFixed(2)}%
                  </span>
                )}
              </span>
              {thr && (
                <span className="text-[10px] text-muted-foreground/70">
                  [{fmtBound(thr.toleranceLower)}–{fmtBound(thr.toleranceUpper)}]
                </span>
              )}
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-medium',
                  muted
                    ? 'text-muted-foreground'
                    : over
                      ? 'text-red-600'
                      : 'text-emerald-600'
                )}
              >
                {over ? '超配' : '低配'}
                {b.driftPct > 0 ? '+' : ''}
                {b.driftPct.toFixed(2)}%
              </span>
              <Badge
                variant="outline"
                className={cn(
                  'h-4 px-1 text-[10px]',
                  SEVERITY_BADGE_CLASS[status]
                )}
              >
                {SEVERITY_LABEL[status]}
              </Badge>
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 pt-2 md:grid-cols-2">
        {/* Sells column */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-600">
            <ArrowDownRight className="h-3.5 w-3.5" />
            卖出
          </div>
          {sells.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            sells.map((t, i) => (
              <TradeRow key={`s-${i}`} trade={t} totalValue={totalValue} />
            ))
          )}
        </div>

        {/* Buys column */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <ArrowUpRight className="h-3.5 w-3.5" />
            买入
          </div>
          {buys.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            buys.map((t, i) => (
              <TradeRow key={`b-${i}`} trade={t} totalValue={totalValue} />
            ))
          )}
        </div>
      </div>

      {(summary.totalSell > 0 || summary.totalBuy > 0) && (
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            合计卖出{' '}
            <span className="font-medium text-red-600">
              {fmtMoney(summary.totalSell)}
            </span>
          </span>
          <span className="tabular-nums">
            合计买入{' '}
            <span className="font-medium text-emerald-600">
              {fmtMoney(summary.totalBuy)}
            </span>
          </span>
          {summary.unfunded > 0 && (
            <span className="tabular-nums text-amber-600">
              需追加资金 {fmtMoney(summary.unfunded)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function fmtBound(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(2)}%`;
}

function TradeRow({
  trade,
  totalValue
}: {
  trade: import('@/lib/rebalance').RebalanceTrade;
  totalValue?: number;
}) {
  const isSell = trade.side === 'sell';
  const pct =
    totalValue && totalValue > 0 ? (trade.amount / totalValue) * 100 : undefined;
  const layerLabel = trade.layer === 'asset' ? '单资产' : '大类';

  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
      <div className="flex items-baseline gap-1.5">
        <Badge
          variant={isSell ? 'destructive' : 'default'}
          className="h-4 shrink-0 px-1 text-[10px]"
        >
          {isSell ? '卖' : '买'}
        </Badge>
        <div className="flex flex-col">
          <span className="text-sm font-medium leading-tight">
            {trade.name ?? trade.symbol ?? trade.bucketLabel}
          </span>
          {!trade.symbol && (
            <span className="text-[10px] text-muted-foreground">
              {trade.bucketLabel} · 按仓位
            </span>
          )}
          {trade.symbol && (
            <span className="text-[10px] text-muted-foreground">
              {trade.bucketLabel} · {trade.symbol}
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div
          className={cn(
            'text-sm font-semibold tabular-nums',
            isSell ? 'text-red-600' : 'text-emerald-600'
          )}
        >
          {isSell ? '-' : '+'}
          {fmtMoney(trade.amount)}
        </div>
        <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground tabular-nums">
          {pct !== undefined && <span>占组合 {pct.toFixed(2)}%</span>}
          <span className="text-muted-foreground/60">· {layerLabel}</span>
          {trade.severity === 'event' && (
            <span className="text-red-600">· 事件</span>
          )}
        </div>
      </div>
    </div>
  );
}
