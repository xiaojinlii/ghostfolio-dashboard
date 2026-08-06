import { useMemo } from 'react';

import type { BucketAssignment } from '@/lib/grouping';
import type { PortfolioPosition } from '@/lib/types';
import { cn, fmtMoney, fmtMoneySigned } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

interface BucketCardProps {
  bucket: BucketAssignment;
  totalValue?: number;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

export function BucketCard({ bucket, totalValue }: BucketCardProps) {
  const bucketColor = `hsl(${bucket.color})`;

  const bucketValue = useMemo(() => {
    if (!totalValue) return undefined;
    return bucket.positions.reduce(
      (sum, p) => sum + (p.valueInBaseCurrency ?? 0),
      0
    );
  }, [bucket.positions, totalValue]);

  const positions = bucket.positions;

  // Drift between actual and target allocation (percentage points).
  const targetPct = bucket.target; // 0..100
  const actualPct = bucket.percentage * 100;
  const drift = targetPct !== undefined ? actualPct - targetPct : undefined;

  return (
    <div
      className="flex flex-col rounded-xl border bg-card text-card-foreground shadow"
      style={{ borderTop: `3px solid ${bucketColor}` }}
    >
      <div className="flex items-baseline justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: bucketColor }}
          />
          <h3 className="text-base font-semibold">{bucket.label}</h3>
          {bucket.desc && (
            <span className="text-xs text-muted-foreground">
              {bucket.desc}
            </span>
          )}
          <Badge variant="secondary" className="font-mono">
            {positions.length}
          </Badge>
        </div>
        <div className="text-right">
          <div className="flex items-baseline justify-end gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {fmtPct(bucket.percentage)}
            </span>
            {targetPct !== undefined && (
              <span className="text-xs text-muted-foreground tabular-nums">
                / 目标 {targetPct.toFixed(2)}%
              </span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {bucketValue !== undefined && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {fmtMoney(bucketValue)}
              </span>
            )}
            {drift !== undefined && (
              <span
                className={cn(
                  'text-xs tabular-nums',
                  Math.abs(drift) < 1
                    ? 'text-muted-foreground'
                    : drift > 0
                      ? 'text-emerald-600'
                      : 'text-red-600'
                )}
              >
                {drift > 0 ? '+' : ''}
                {drift.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-2 pb-2">
        {positions.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            无持仓
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead className="text-right">价值</TableHead>
                <TableHead className="text-right">涨跌</TableHead>
                <TableHead className="text-right">表现</TableHead>
                <TableHead className="text-right">占本仓</TableHead>
                <TableHead className="text-right">占组合</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((p) => (
                <HoldingRow
                  key={posKey(p)}
                  position={p}
                  bucketPercentage={bucket.percentage}
                  assetTarget={findAssetTarget(bucket, p)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function HoldingRow({
  position,
  bucketPercentage,
  assetTarget
}: {
  position: PortfolioPosition;
  bucketPercentage: number;
  assetTarget?: { target: number }; // target % within bucket (0..100)
}) {
  const ofBucket =
    bucketPercentage > 0
      ? (position.allocationInPercentage ?? 0) / bucketPercentage
      : 0;

  // 涨跌：累计净盈亏金额（含汇率影响）= netPerformanceWithCurrencyEffect。
  const change = position.netPerformanceWithCurrencyEffect ?? 0;
  const up = change >= 0;

  // 表现：累计净收益率（含汇率影响）。
  const pnlPct = position.netPerformancePercentWithCurrencyEffect ?? 0;
  const pnlUp = pnlPct >= 0;

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium leading-tight">
            {position.assetProfile.name ?? position.assetProfile.symbol}
          </span>
          <span className="text-xs text-muted-foreground">
            {position.assetProfile.symbol}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {fmtMoney(position.valueInBaseCurrency)}
      </TableCell>
      <TableCell
        className={cn(
          'text-right tabular-nums',
          up ? 'text-emerald-600' : 'text-red-600'
        )}
      >
        {fmtMoneySigned(change)}
      </TableCell>
      <TableCell
        className={cn(
          'text-right tabular-nums',
          pnlUp ? 'text-emerald-600' : 'text-red-600'
        )}
      >
        {pnlUp ? '+' : ''}
        {(pnlPct * 100).toFixed(2)}%
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {fmtPct(ofBucket)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {fmtPct(position.allocationInPercentage ?? 0)}
        {assetTarget && (
          <span className="ml-1 text-[10px] text-muted-foreground/70">
            /{assetTarget.target.toFixed(0)}%
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Match an asset target to a position by symbol or assetProfile.name. */
function findAssetTarget(
  bucket: BucketAssignment,
  pos: PortfolioPosition
): { target: number } | undefined {
  if (!bucket.assets) return undefined;
  const sym = pos.assetProfile.symbol;
  const name = pos.assetProfile.name;
  return bucket.assets.find((a) => a.name === sym || a.name === name);
}

function posKey(p: PortfolioPosition): string {
  return `${p.assetProfile.dataSource ?? 'manual'}:${p.assetProfile.symbol}`;
}
