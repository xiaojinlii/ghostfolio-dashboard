import { useState } from 'react';
import { KeyRound, Loader2, LogIn } from 'lucide-react';

import { ApiError, loginAnonymous } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LoginScreenProps {
  ghostfolioUrl: string;
  onLogin: (authToken: string, securityToken: string) => void;
  onOpenSettings: () => void;
}

export function LoginScreen({
  ghostfolioUrl,
  onLogin,
  onOpenSettings
}: LoginScreenProps) {
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { authToken } = await loginAnonymous(ghostfolioUrl, token.trim());
      onLogin(authToken, token.trim());
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError('网络异常，请确认 Ghostfolio 地址正确且服务可达');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <KeyRound className="h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-bold">仓位 Dashboard 登录</h1>
          <p className="text-sm text-muted-foreground">
            使用 Ghostfolio 的 Security Token 登录
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="securityToken">Security Token</Label>
            <Input
              id="securityToken"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="粘贴 Ghostfolio 权限页的安全令牌"
              autoFocus
              autoComplete="current-password"
            />
            <p className="text-xs text-muted-foreground">
              在 Ghostfolio 网页端 → <b>My Assets → Access</b>（权限页签）→
              生成 Security Token 后粘贴到此。
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                <LogIn />
                登录
              </>
            )}
          </Button>
        </form>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            连接到：
            <code className="ml-1 rounded bg-muted px-1">
              {ghostfolioUrl || '同源 (localhost:3333)'}
            </code>
          </span>
          <Button variant="link" size="sm" onClick={onOpenSettings}>
            改地址
          </Button>
        </div>
      </div>
    </div>
  );
}
