import type {
  PortfolioDetails,
  PortfolioHoldingDetail,
  PortfolioHoldingsResponse,
  Tag
} from './types';

const DEFAULT_API_BASE = '/api/v1';

export interface OAuthResponse {
  authToken: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Resolve the Ghostfolio API base from the configured instance URL.
 * - Empty / relative: same-origin "/api/v1" (Vite proxy in dev, reverse
 *   proxy in prod).
 * - Absolute URL (http(s)://host[:port]): that host's "/api/v1".
 * Trailing slashes are tolerated.
 */
export function resolveApiBase(ghostfolioUrl: string): string {
  const trimmed = (ghostfolioUrl ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_API_BASE;
  return `${trimmed}/api/v1`;
}

/**
 * Exchange a Security Token (User.accessToken) for a JWT authToken.
 * Endpoint: POST /api/v1/auth/anonymous  (auth.controller.ts:38)
 * On success returns { authToken } (auth.service.ts:30 signs the JWT).
 * Wrong/expired token => 403.
 */
export async function loginAnonymous(
  ghostfolioUrl: string,
  securityToken: string
): Promise<OAuthResponse> {
  const res = await fetch(`${resolveApiBase(ghostfolioUrl)}/auth/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: securityToken })
  });

  if (res.status === 403) {
    throw new ApiError(403, 'Security Token 不正确。');
  }
  if (!res.ok) {
    throw new ApiError(res.status, `登录失败 (${res.status})`);
  }
  return (await res.json()) as OAuthResponse;
}

async function request<T>(
  path: string,
  authToken: string,
  ghostfolioUrl: string,
  init?: RequestInit
): Promise<T> {
  const base = resolveApiBase(ghostfolioUrl);
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      // JWT bearer, same as the official web client (auth.interceptor.ts:49)
      Authorization: `Bearer ${authToken}`,
      ...(init?.headers ?? {})
    }
  });

  if (res.status === 401) {
    throw new ApiError(401, '登录已过期，请重新登录。');
  }
  if (!res.ok) {
    throw new ApiError(res.status, `请求失败 (${res.status})`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  getHoldings(authToken: string, ghostfolioUrl: string) {
    return request<PortfolioHoldingsResponse>(
      '/portfolio/holdings',
      authToken,
      ghostfolioUrl,
      { method: 'GET' }
    );
  },

  getPortfolioDetails(authToken: string, ghostfolioUrl: string) {
    return request<PortfolioDetails>(
      '/portfolio/details',
      authToken,
      ghostfolioUrl,
      { method: 'GET' }
    );
  },

  // Per-holding detail (GET /portfolio/holding/:ds/:symbol). The bulk
  // /portfolio/holdings response omits averagePrice, so we fetch each
  // holding's detail to compute 涨跌 (marketPrice vs averagePrice).
  getHoldingDetail(
    authToken: string,
    ghostfolioUrl: string,
    dataSource: string,
    symbol: string
  ) {
    const encoded = encodeURIComponent(symbol);
    return request<PortfolioHoldingDetail>(
      `/portfolio/holding/${dataSource}/${encoded}`,
      authToken,
      ghostfolioUrl,
      { method: 'GET' }
    );
  },

  createTag(authToken: string, ghostfolioUrl: string, name: string) {
    return request<Tag>('/tags', authToken, ghostfolioUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, userId: null })
    });
  },

  updateHoldingTags(
    authToken: string,
    ghostfolioUrl: string,
    dataSource: string,
    symbol: string,
    tagIds: string[]
  ) {
    const encoded = encodeURIComponent(symbol);
    return request<void>(
      `/portfolio/holding/${dataSource}/${encoded}/tags`,
      authToken,
      ghostfolioUrl,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: tagIds })
      }
    );
  }
};
