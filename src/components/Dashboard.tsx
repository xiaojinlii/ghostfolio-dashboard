import { useMemo, useState } from 'react';
import { LogOut, Plus, RefreshCw, Settings as SettingsIcon } from 'lucide-react';

import { assignBuckets, type BucketAssignment } from '@/lib/grouping';
import type { PortfolioPosition, Tag } from '@/lib/types';
import type { SidecarConfig } from '@/lib/config';
import { fmtMoney } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BucketCard } from './BucketCard';
import { SettingsPanel } from './SettingsPanel';

interface DashboardProps {
  positions: PortfolioPosition[];
  tags: Tag[];
  totalValue?: number;
  config: SidecarConfig;
  onConfigChange: (next: SidecarConfig) => void;
  onRefresh: () => void;
  refreshing: boolean;
  error?: string | null;
  onLogout: () => void;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

export function Dashboard({
  positions,
  tags,
  totalValue,
  config,
  onConfigChange,
  onRefresh,
  refreshing,
  error,
  onLogout
}: DashboardProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const buckets: BucketAssignment[] = useMemo(
    () => assignBuckets(positions, config),
    [positions, config]
  );

  const untracked = buckets.find((b) => b.id === 'untracked')?.percentage ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold">仓位 Dashboard</h1>
            {totalValue !== undefined && (
              <span className="text-sm text-muted-foreground tabular-nums">
                组合总值 {fmtMoney(totalValue)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="刷新"
            >
              <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onLogout}
              aria-label="退出登录"
            >
              <LogOut />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon />
              设置
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Overview bar */}
        <div className="mb-4">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {buckets
              .filter((b) => b.id !== 'untracked')
              .map((b) => (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1 tabular-nums"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: `hsl(${b.color})` }}
                  />
                  {b.label} {fmtPct(b.percentage)}
                </span>
              ))}
            <span className="inline-flex items-center gap-1 tabular-nums">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
              未分类 {fmtPct(untracked)}
            </span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {buckets
              .filter((b) => b.id !== 'untracked' && b.percentage > 0)
              .map((b) => (
                <div
                  key={b.id}
                  className="h-full"
                  style={{
                    width: `${Math.min(100, b.percentage * 100)}%`,
                    backgroundColor: `hsl(${b.color})`
                  }}
                  title={`${b.label} ${fmtPct(b.percentage)}`}
                />
              ))}
            {untracked > 0 && (
              <div
                className="h-full bg-muted-foreground/40"
                style={{ width: `${Math.min(100, untracked * 100)}%` }}
                title={`未分类 ${fmtPct(untracked)}`}
              />
            )}
          </div>
        </div>

        {/* Bucket grid */}
        <div className="grid grid-cols-1 gap-4">
          {buckets.map((b) => (
            <BucketCard key={b.id} bucket={b} totalValue={totalValue} />
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Plus className="inline h-3 w-3" /> 在 Ghostfolio 给持仓打标签，这里自动归类
        </p>
      </main>

      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={config}
        onConfigChange={onConfigChange}
        tags={tags}
      />
    </div>
  );
}
