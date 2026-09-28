import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, ApiError, loginAnonymous } from '@/lib/api';
import {
  DEFAULT_CONFIG,
  GHOSTFOLIO_URL,
  clearAuthToken,
  clearSecurityToken,
  loadAuthToken,
  loadSecurityToken,
  saveAuthToken,
  saveSecurityToken,
  type SidecarConfig
} from '@/lib/config';
import { collectTags } from '@/lib/grouping';
import type { PortfolioPosition } from '@/lib/types';
import { Dashboard } from '@/components/Dashboard';
import { LoginScreen } from '@/components/LoginScreen';
import { SettingsPanel } from '@/components/SettingsPanel';

export function App() {
  // config.json content — loaded from the sidecar dev backend on mount.
  const [config, setConfig] = useState<SidecarConfig>(() => DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Security Token (credential) + JWT — kept in browser storage, never in
  // config.json.
  const [securityToken, setSecurityToken] = useState<string>(() =>
    loadSecurityToken()
  );
  const [authToken, setAuthToken] = useState<string | null>(() =>
    loadAuthToken()
  );

  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [totalValue, setTotalValue] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tags = useMemo(() => collectTags(positions), [positions]);

  // Ghostfolio base URL comes from the environment, not config.json.
  const ghostfolioUrl = GHOSTFOLIO_URL;

  // --- Load config.json on mount -------------------------------------------
  useEffect(() => {
    void (async () => {
      try {
        const cfg = await api.getConfig();
        setConfig(cfg);
      } catch {
        // Use defaults; the settings panel can still create one.
      } finally {
        setConfigLoaded(true);
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const [holdings, details] = await Promise.all([
        api.getHoldings(authToken, ghostfolioUrl),
        api.getPortfolioDetails(authToken, ghostfolioUrl)
      ]);
      const baseHoldings = (holdings.holdings ?? []).filter(
        (position) => (position.valueInBaseCurrency ?? 0) > 0
      );

      // Enrich each holding with detail (netPerformanceWithCurrencyEffect etc.).
      // Failures here don't abort the dashboard — we just keep bulk values.
      const enriched = await Promise.all(
        baseHoldings.map(async (p) => {
          const ds = p.assetProfile.dataSource;
          const sym = p.assetProfile.symbol;
          if (!ds || !sym) return p;
          try {
            const detail = await api.getHoldingDetail(authToken, ghostfolioUrl, ds, sym);
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
          } catch (e) {
            // Log per-holding enrichment failures so a single bad holding
            // doesn't silently drop its detail data.
            console.warn(
              `[sidecar] getHoldingDetail failed for ${ds}:${sym}`,
              e
            );
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
          clearAuthToken();
          setAuthToken(null);
        }
      } else {
        setError('网络或服务异常，请确认 Ghostfolio 地址正确且服务可达');
      }
    } finally {
      setLoading(false);
    }
  }, [authToken, ghostfolioUrl]);

  useEffect(() => {
    if (authToken && configLoaded) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, configLoaded]);

  // Re-derive a JWT on first load if a Security Token is remembered.
  useEffect(() => {
    if (!authToken && securityToken && configLoaded) {
      void (async () => {
        try {
          const { authToken: jwt } = await loginAnonymous(
            ghostfolioUrl,
            securityToken
          );
          saveAuthToken(jwt);
          setAuthToken(jwt);
        } catch {
          // Bad/rotated token — user must re-login manually.
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configLoaded]);

  const handleLogin = (jwt: string, token: string) => {
    saveAuthToken(jwt);
    saveSecurityToken(token);
    setAuthToken(jwt);
    setSecurityToken(token);
  };

  const handleLogout = () => {
    clearAuthToken();
    clearSecurityToken();
    setAuthToken(null);
    setSecurityToken('');
    setPositions([]);
    setTotalValue(undefined);
  };

  const handleConfigChange = async (next: SidecarConfig) => {
    try {
      const saved = await api.putConfig(next);
      setConfig(saved);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError('保存配置失败');
      }
    }
  };

  // --- Login gate ----------------------------------------------------------
  if (!authToken) {
    return (
      <>
        <LoginScreen
          ghostfolioUrl={ghostfolioUrl}
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
