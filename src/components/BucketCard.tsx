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

  const positions =
    bucket.positions.length > 0 ? bucket.positions : [];

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
          <Badge variant="secondary" className="font-mono">
            {positions.length}
          </Badge>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">
            {fmtPct(bucket.percentage)}
          </div>
          {bucketValue !== undefined && (
            <div className="text-xs text-muted-foreground tabular-nums">
              {fmtMoney(bucketValue)}
            </div>
          )}
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
  bucketPercentage
}: {
  position: PortfolioPosition;
  bucketPercentage: number;
}) {
  const ofBucket =
    bucketPercentage > 0
      ? (position.allocationInPercentage ?? 0) / bucketPercentage
      : 0;

  // 涨跌：累计净盈亏金额（含汇率影响）= netPerformanceWithCurrencyEffect。
  // 直接取 Ghostfolio 计算好的字段，来自 GET /portfolio/holding/:ds/:symbol。
  const change = position.netPerformanceWithCurrencyEffect ?? 0;
  const up = change >= 0;

  // 盈亏（表现）：累计净收益率（含汇率影响）。
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
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {fmtPct(ofBucket)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {fmtPct(position.allocationInPercentage ?? 0)}
      </TableCell>
    </TableRow>
  );
}

function posKey(p: PortfolioPosition): string {
  return `${p.assetProfile.dataSource ?? 'manual'}:${p.assetProfile.symbol}`;
}
