import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import {
  DEFAULT_CONFIG,
  type AssetTarget,
  type BucketConfig,
  type SidecarConfig,
  type ThresholdOverride
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

/** Empty string → undefined (use 5/25 default); a number → that number.
 *  Used by the threshold inputs so "blank" means "derive from the rule". */
function numOrUndef(v: string): number | undefined {
  const t = v.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** undefined → '' (blank input); number → its string. Inverse of numOrUndef. */
function undefOrStr(n: number | undefined): string {
  return n === undefined ? '' : String(n);
}

/** Update a subset of ThresholdOverride fields on either a bucket or an asset.
 *  Returns a new object with the patch merged onto the existing overrides. */
function patchThreshold<T extends ThresholdOverride>(
  base: T,
  patch: Partial<ThresholdOverride>
): T {
  return { ...base, ...patch };
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

                  {/* 大类阈值 (Layer 2). 留空 = 5/25 默认。 */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      大类阈值（Layer 2）
                      <span className="ml-1 text-muted-foreground/70">
                        留空 = 5/25 默认；单位为占组合 %
                      </span>
                    </Label>
                    <ThresholdEditor
                      target={bucket.target}
                      override={bucket}
                      onPatch={(patch) =>
                        updateBucket(i, patchThreshold(bucket, patch))
                      }
                    />
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
                      <div
                        key={ai}
                        className="space-y-2 rounded-md border p-2.5"
                      >
                        <div className="flex items-center gap-2">
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
                        {/* 单资产阈值 (Layer 1). 留空 = 5/25 默认。 */}
                        <ThresholdEditor
                          target={asset.target}
                          override={asset}
                          compact
                          onPatch={(patch) =>
                            updateAsset(i, ai, patchThreshold(asset, patch))
                          }
                        />
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

interface ThresholdEditorProps {
  /** Current target percent (0..100). Used for the 5/25 hint, not for editing. */
  target?: number;
  /** The override object being edited (bucket or asset). */
  override: ThresholdOverride;
  /** Compact mode: smaller inputs, no per-field label. */
  compact?: boolean;
  onPatch: (patch: Partial<ThresholdOverride>) => void;
}

/** Four-input editor for toleranceLower/Upper + eventLower/Upper.
 *  Blank = derive from the 5/25 default (shown as placeholder). */
function ThresholdEditor({
  target,
  override,
  compact,
  onPatch
}: ThresholdEditorProps) {
  // 5/25 default values for placeholders, so the user sees what "blank" means.
  const tol =
    target !== undefined
      ? Math.min(5, target * 0.25)
      : undefined;
  const defLower = tol !== undefined ? Math.max(0, target! - tol) : undefined;
  const defUpper = tol !== undefined ? target! + tol : undefined;
  const defEvtLower =
    tol !== undefined ? target! - tol * 0.8 : undefined;
  const defEvtUpper =
    tol !== undefined ? target! + tol * 1.2 : undefined;

  const ph = (v?: number) => (v === undefined ? '5/25' : v.toFixed(2));

  const fields: {
    key: keyof ThresholdOverride;
    label: string;
    def: number | undefined;
  }[] = [
    { key: 'toleranceLower', label: '容忍下限', def: defLower },
    { key: 'toleranceUpper', label: '容忍上限', def: defUpper },
    { key: 'eventLower', label: '事件下线', def: defEvtLower },
    { key: 'eventUpper', label: '事件上线', def: defEvtUpper }
  ];

  return (
    <div className={cn('grid gap-1.5', compact ? 'grid-cols-4' : 'grid-cols-2')}>
      {fields.map((f) => (
        <div key={f.key} className="space-y-0.5">
          {!compact && (
            <Label className="text-[10px] text-muted-foreground">
              {f.label}
            </Label>
          )}
          <Input
            type="number"
            value={undefOrStr(override[f.key] as number | undefined)}
            onChange={(e) =>
              onPatch({ [f.key]: numOrUndef(e.target.value) })
            }
            placeholder={ph(f.def)}
            className={cn(compact ? 'h-7 text-xs' : 'h-8 text-xs')}
            step="0.25"
            title={compact ? f.label : undefined}
          />
        </div>
      ))}
    </div>
  );
}
