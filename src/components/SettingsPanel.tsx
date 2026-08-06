import { useState } from 'react';

import {
  BUCKET_IDS,
  BUCKET_LABELS,
  type BucketId,
  type SidecarConfig
} from '@/lib/config';
import { isBucketTagPresent } from '@/lib/grouping';
import type { Tag } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
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
import { Switch } from '@/components/ui/switch';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: SidecarConfig;
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

  const apply = () => {
    onConfigChange(local);
    onOpenChange(false);
  };

  const moveBucket = (id: BucketId, dir: -1 | 1) => {
    const arr = [...local.priority];
    const i = arr.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setLocal({ ...local, priority: arr });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            配置 API Key 与仓位 → 标签映射。配置保存在浏览器本地。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Ghostfolio URL */}
          <div className="space-y-2">
            <Label htmlFor="ghostfolioUrl">Ghostfolio 地址</Label>
            <Input
              id="ghostfolioUrl"
              type="text"
              value={local.ghostfolioUrl}
              placeholder="留空 = 同源 /api/v1（默认）"
              onChange={(e) =>
                setLocal({ ...local, ghostfolioUrl: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              本地默认同源（Vite 代理到 <code>localhost:3333</code>）；连远程实例填完整地址，如
              <code className="mx-1 rounded bg-muted px-1">https://gf.example.com</code>
              或 <code className="rounded bg-muted px-1">http://192.168.1.5:3333</code>。
            </p>
          </div>

          {/* Security token */}
          <div className="space-y-2">
            <Label htmlFor="securityToken">Security Token</Label>
            <Input
              id="securityToken"
              type="password"
              value={local.securityToken}
              placeholder="Ghostfolio 权限页的安全令牌"
              onChange={(e) =>
                setLocal({ ...local, securityToken: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              在 Ghostfolio → <b>My Assets → Access</b>（权限页签）生成 Security Token
              粘到这里。登录用此令牌换取会话凭证。
            </p>
          </div>

          {/* Bucket -> tag mapping */}
          <div className="space-y-3">
            <Label>仓位 → 标签映射</Label>
            <div className="space-y-2">
              {BUCKET_IDS.map((id) => {
                const matched = isBucketTagPresent(local, id, tags);
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 rounded-md border p-2"
                  >
                    <span className="w-16 text-sm font-medium">
                      {BUCKET_LABELS[id]}
                    </span>
                    <Input
                      value={local.buckets[id]}
                      onChange={(e) =>
                        setLocal({
                          ...local,
                          buckets: { ...local.buckets, [id]: e.target.value }
                        })
                      }
                      placeholder="标签名"
                      className="flex-1"
                    />
                    {matched ? (
                      <Badge>已匹配</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        未匹配
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              填写你在 Ghostfolio 里创建的标签名（区分大小写）。匹配后该仓位卡才会生效。
            </p>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>归类优先级</Label>
            <p className="text-xs text-muted-foreground">
              一个持仓同时命中多个标签时，按此顺序归入第一个命中的仓位。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {local.priority.map((id, i) => (
                <div
                  key={id}
                  className="flex items-center rounded-md border bg-muted/40 px-2 py-1"
                >
                  <span className="mr-1 text-xs text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm">{BUCKET_LABELS[id]}</span>
                  <div className="ml-1 flex flex-col">
                    <button
                      onClick={() => moveBucket(id, -1)}
                      disabled={i === 0}
                      className="text-xs leading-none disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveBucket(id, 1)}
                      disabled={i === local.priority.length - 1}
                      className="text-xs leading-none disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cash strategy */}
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="autoCash">自动现金仓</Label>
              <p className="text-xs text-muted-foreground">
                CASH 类型持仓自动归入现金仓，无需打标签。
              </p>
            </div>
            <Switch
              id="autoCash"
              checked={local.autoCashBucket}
              onCheckedChange={(v) =>
                setLocal({ ...local, autoCashBucket: v })
              }
            />
          </div>

          {/* Create tag helper */}
          <div className="space-y-2">
            <Label>当前已有标签</Label>
            <p className="text-xs text-muted-foreground">
              标签请在 Ghostfolio 的 Tags 页创建，这里仅匹配名称。
            </p>
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <Badge key={t.id} variant="secondary">
                  {t.name}
                </Badge>
              ))}
              {tags.length === 0 && (
                <span className="text-xs text-muted-foreground">暂无标签</span>
              )}
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
