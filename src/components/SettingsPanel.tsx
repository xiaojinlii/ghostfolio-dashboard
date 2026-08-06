import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import {
  DEFAULT_CONFIG,
  type AssetTarget,
  type BucketConfig,
  type SidecarConfig
} from '@/lib/config';
import { isBucketTagPresent } from '@/lib/grouping';
import type { Tag } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Ghostfolio assetSubClass values (EnhancedAssetProfile.assetSubClass).
// Offered as quick-pick chips; arbitrary values are still accepted via the
// text input (parsed as a comma-separated list).
const ASSET_SUB_CLASSES = [
  'CASH',
  'STOCK',
  'ETF',
  'BOND',
  'CRYPTOCURRENCY',
  'COMMODITY',
  'PRECIOUS_METAL',
  'MUTUAL_FUND',
  'PRIVATE_EQUITY'
] as const;

/** Parse a comma-separated string into a normalized, deduped sub-class list
 *  (uppercased, trimmed, empties dropped). e.g. "cash, ETF" → ["CASH","ETF"]. */
function parseSubClasses(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(',')) {
    const v = part.trim().toUpperCase();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Inverse of parseSubClasses for rendering in the text input. */
function joinSubClasses(list?: string[]): string {
  return (list ?? []).join(', ');
}

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current config.json content (loaded from the dev backend). */
  config: SidecarConfig;
  /** Persist updated config to config.json. */
  onConfigChange: (next: SidecarConfig) => void;
  tags: Tag[];
}

export function SettingsPanel({
  open,
  onOpenChange,
  config,
  onConfigChange,
  tags
}: SettingsPanelProps) {
  const [local, setLocal] = useState<SidecarConfig>(config);

  // Reset local state when the panel opens or the upstream config changes.
  useEffect(() => {
    if (open) setLocal(config);
  }, [open, config]);

  const apply = () => {
    onConfigChange(local);
    onOpenChange(false);
  };

  const updateBucket = (i: number, patch: Partial<BucketConfig>) => {
    setLocal((prev) => {
      const buckets = [...prev.buckets];
      buckets[i] = { ...buckets[i], ...patch };
      return { ...prev, buckets };
    });
  };

  const addBucket = () => {
    setLocal((prev) => ({
      ...prev,
      buckets: [
        ...prev.buckets,
        {
          name: '新仓位',
          tag: '',
          desc: '',
          target: 0,
          color: '215 16% 47%'
        }
      ]
    }));
  };

  const removeBucket = (i: number) => {
    setLocal((prev) => ({
      ...prev,
      buckets: prev.buckets.filter((_, idx) => idx !== i)
    }));
  };

  const moveBucket = (i: number, dir: -1 | 1) => {
    setLocal((prev) => {
      const arr = [...prev.buckets];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...prev, buckets: arr };
    });
  };

  const updateAsset = (
    bi: number,
    ai: number,
    patch: Partial<AssetTarget>
  ) => {
    setLocal((prev) => {
      const buckets = [...prev.buckets];
      const assets = [...(buckets[bi].assets ?? [])];
      assets[ai] = { ...assets[ai], ...patch };
      buckets[bi] = { ...buckets[bi], assets };
      return { ...prev, buckets };
    });
  };

  const addAsset = (bi: number) => {
    setLocal((prev) => {
      const buckets = [...prev.buckets];
      const assets = [...(buckets[bi].assets ?? []), { name: '', target: 0 }];
      buckets[bi] = { ...buckets[bi], assets };
      return { ...prev, buckets };
    });
  };

  const removeAsset = (bi: number, ai: number) => {
    setLocal((prev) => {
      const buckets = [...prev.buckets];
      const assets = (buckets[bi].assets ?? []).filter((_, idx) => idx !== ai);
      buckets[bi] = {
        ...buckets[bi],
        assets: assets.length ? assets : undefined
      };
      return { ...prev, buckets };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            仓位配置保存在 config.json，保存后立即生效。Security Token 单独存在浏览器本地。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Buckets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>仓位配置（顺序 = 归类优先级）</Label>
              <Button variant="outline" size="sm" onClick={addBucket}>
                <Plus />
                新增仓位
              </Button>
            </div>

            {local.buckets.map((bucket, i) => {
              const matched = isBucketTagPresent(bucket, tags);
              return (
                <div key={i} className="rounded-md border p-3 space-y-3">
                  {/* header row: priority controls + remove */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        #{i + 1}
                      </span>
                      <div className="flex flex-col">
                        <button
                          onClick={() => moveBucket(i, -1)}
                          disabled={i === 0}
                          className="text-xs leading-none disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveBucket(i, 1)}
                          disabled={i === local.buckets.length - 1}
                          className="text-xs leading-none disabled:opacity-30"
                        >
                          ▼
                        </button>
                      </div>
                      {matched ? (
                        <Badge>标签已匹配</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          标签未匹配
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeBucket(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* name / tag / color */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">名称</Label>
                      <Input
                        value={bucket.name}
                        onChange={(e) => updateBucket(i, { name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">标签 (tag)</Label>
                      <Input
                        value={bucket.tag}
                        onChange={(e) => updateBucket(i, { tag: e.target.value })}
                        placeholder="Ghostfolio 标签名"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">描述 (desc)</Label>
                    <Input
                      value={bucket.desc ?? ''}
                      onChange={(e) => updateBucket(i, { desc: e.target.value })}
                      placeholder="显示在仓位名后"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">目标占比 (%)</Label>
                      <Input
                        type="number"
                        value={bucket.target ?? 0}
                        onChange={(e) =>
                          updateBucket(i, {
                            target: Number(e.target.value)
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">颜色 (HSL)</Label>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-6 w-6 shrink-0 rounded"
                          style={{ backgroundColor: `hsl(${bucket.color})` }}
                        />
                        <Input
                          value={bucket.color ?? ''}
                          onChange={(e) =>
                            updateBucket(i, { color: e.target.value })
                          }
                          placeholder="199 89% 48%"
                        />
                      </div>
                    </div>
                  </div>

                  {/* assetSubClass — which Ghostfolio sub-classes this bucket
                      absorbs when no tag matched (e.g. CASH for the cash
                      bucket; synthetic cash has no tags to match). */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      资产子类 (assetSubClass)
                      <span className="ml-1 text-muted-foreground/70">
                        无标签匹配时，按此归类（如 CASH）
                      </span>
                    </Label>
                    <Input
                      value={joinSubClasses(bucket.assetSubClass)}
                      onChange={(e) => {
                        const parsed = parseSubClasses(e.target.value);
                        updateBucket(i, {
                          assetSubClass: parsed.length ? parsed : undefined
                        });
                      }}
                      placeholder="留空则不按子类归类；多个用逗号分隔"
                    />
                    <div className="flex flex-wrap gap-1">
                      {ASSET_SUB_CLASSES.map((sc) => {
                        const active = bucket.assetSubClass?.includes(sc);
                        return (
                          <button
                            key={sc}
                            type="button"
                            onClick={() => {
                              const cur = new Set(bucket.assetSubClass ?? []);
                              if (active) cur.delete(sc);
                              else cur.add(sc);
                              const next = Array.from(cur);
                              updateBucket(i, {
                                assetSubClass: next.length ? next : undefined
                              });
                            }}
                            className={cn(
                              badgeVariants({
                                variant: active ? 'default' : 'outline'
                              }),
                              active
                                ? 'border-transparent bg-primary text-primary-foreground'
                                : 'opacity-60 hover:opacity-100'
                            )}
                          >
                            {sc}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* assets */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">
                        资产目标（可选，留空则不控制）
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6"
                        onClick={() => addAsset(i)}
                      >
                        <Plus className="h-3 w-3" /> 资产
                      </Button>
                    </div>
                    {bucket.assets?.map((asset, ai) => (
                      <div key={ai} className="flex items-center gap-2">
                        <Input
                          value={asset.name}
                          onChange={(e) =>
                            updateAsset(i, ai, { name: e.target.value })
                          }
                          placeholder="名称/symbol"
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          value={asset.target}
                          onChange={(e) =>
                            updateAsset(i, ai, {
                              target: Number(e.target.value)
                            })
                          }
                          placeholder="目标%"
                          className="w-24"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => removeAsset(i, ai)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* available tags hint */}
            <div className="space-y-1">
              <Label className="text-xs">持仓中出现的标签</Label>
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Badge key={t.id} variant="secondary">
                    {t.name}
                  </Badge>
                ))}
                {tags.length === 0 && (
                  <span className="text-xs text-muted-foreground">暂无</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={apply}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-export so SettingsPanel callers can fall back to a default config object.
export { DEFAULT_CONFIG };
