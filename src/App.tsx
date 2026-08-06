import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, ApiError, loginAnonymous } from '@/lib/api';
import {
  clearAuthToken,
  loadAuthToken,
  loadConfig,
  saveAuthToken,
  saveConfig,
  type SidecarConfig
} from '@/lib/config';
import { collectTags } from '@/lib/grouping';
import type { PortfolioPosition } from '@/lib/types';
import { Dashboard } from '@/components/Dashboard';
import { LoginScreen } from '@/components/LoginScreen';
import { SettingsPanel } from '@/components/SettingsPanel';

export function App() {
  const [config, setConfig] = useState<SidecarConfig>(() => loadConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // JWT authToken: kept in sessionStorage, derived from the Security Token.
  const [authToken, setAuthToken] = useState<string | null>(() =>
    loadAuthToken()
  );

  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [totalValue, setTotalValue] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tags are derived from the holdings themselves (each position embeds its
  // own tags) — never call GET /tags, which is ADMIN-only (readTags) and
  // 403s for normal users.
  const tags = useMemo(() => collectTags(positions), [positions]);

  const refresh = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const [holdings, details] = await Promise.all([
        api.getHoldings(authToken, config.ghostfolioUrl),
        api.getPortfolioDetails(authToken, config.ghostfolioUrl)
      ]);
      const baseHoldings = holdings.holdings ?? [];

      // The bulk /portfolio/holdings response omits some performance fields
      // (netPerformanceWithCurrencyEffect / netPerformancePercentWithCurrencyEffect
      // may be range-scoped and missing in the bulk list). Fetch each holding's
      // detail in parallel to enrich 涨跌 / 表现. Failures (e.g. synthetic cash
      // positions) just leave the bulk values as-is.
      const enriched = await Promise.all(
        baseHoldings.map(async (p) => {
          const ds = p.assetProfile.dataSource;
          const sym = p.assetProfile.symbol;
          if (!ds || !sym) return p;
          try {
            const detail = await api.getHoldingDetail(
              authToken,
              config.ghostfolioUrl,
              ds,
              sym
            );
            return {
              ...p,
              netPerformance: detail.netPerformance ?? p.netPerformance,
              netPerformancePercent:
                detail.netPerformancePercent ?? p.netPerformancePercent,
              netPerformancePercentWithCurrencyEffect:
                detail.netPerformancePercentWithCurrencyEffect ??
                p.netPerformancePercentWithCurrencyEffect,
              netPerformanceWithCurrencyEffect:
                detail.netPerformanceWithCurrencyEffect ??
                p.netPerformanceWithCurrencyEffect
            };
          } catch {
            return p;
          }
        })
      );

      setPositions(enriched);
      setTotalValue(
        details.summary?.totalValueInBaseCurrency as number | undefined
      );
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        if (e.status === 401) {
          // JWT expired — back to login.
          clearAuthToken();
          setAuthToken(null);
        }
      } else {
        setError('网络或服务异常，请确认 Ghostfolio 地址正确且服务可达');
      }
    } finally {
      setLoading(false);
    }
  }, [authToken, config.ghostfolioUrl]);

  useEffect(() => {
    if (authToken) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, config.ghostfolioUrl]);

  // Re-derive a JWT on first load if a Security Token is remembered but we
  // have no session token yet (e.g. after a page refresh).
  useEffect(() => {
    if (!authToken && config.securityToken) {
      void (async () => {
        try {
          const { authToken: jwt } = await loginAnonymous(
            config.ghostfolioUrl,
            config.securityToken
          );
          saveAuthToken(jwt);
          setAuthToken(jwt);
        } catch {
          // Bad/rotated token — user must re-login manually.
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (jwt: string, securityToken: string) => {
    saveAuthToken(jwt);
    setAuthToken(jwt);
    // Remember the Security Token so refresh re-derives the JWT automatically.
    const next = { ...config, securityToken };
    setConfig(next);
    saveConfig(next);
  };

  const handleLogout = () => {
    clearAuthToken();
    setAuthToken(null);
    setPositions([]);
    setTotalValue(undefined);
  };

  const handleConfigChange = (next: SidecarConfig) => {
    setConfig(next);
    saveConfig(next);
  };

  // --- Login gate --------------------------------------------------------
  if (!authToken) {
    return (
      <>
        <LoginScreen
          ghostfolioUrl={config.ghostfolioUrl}
          onLogin={handleLogin}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <SettingsPanel
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          config={config}
          onConfigChange={handleConfigChange}
          tags={tags}
        />
      </>
    );
  }

  // --- Dashboard ---------------------------------------------------------
  return (
    <Dashboard
      positions={positions}
      tags={tags}
      totalValue={totalValue}
      config={config}
      onConfigChange={handleConfigChange}
      onRefresh={refresh}
      refreshing={loading}
      error={error}
      onLogout={handleLogout}
    />
  );
}
