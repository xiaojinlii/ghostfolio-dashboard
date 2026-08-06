// Types mirroring the Ghostfolio API responses.
// Source of truth: libs/common/src/lib/interfaces/portfolio-position.interface.ts
// and prisma/schema.prisma (model Tag).

export interface Tag {
  id: string;
  name: string;
  userId?: string | null;
}

export type AssetClass =
  | 'COMMODITY'
  | 'EQUITY'
  | 'FIXED_INCOME'
  | 'LIQUIDITY'
  | 'REAL_ESTATE'
  | string;

export type AssetSubClass =
  | 'BOND'
  | 'CASH'
  | 'COMMODITY'
  | 'CRYPTOCURRENCY'
  | 'ETF'
  | 'MUTUAL_FUND'
  | 'PRECIOUS_METAL'
  | 'PRIVATE_EQUITY'
  | 'STOCK'
  | string;

export interface EnhancedAssetProfile {
  assetClass?: AssetClass;
  assetSubClass?: AssetSubClass;
  assetClassLabel?: string;
  assetSubClassLabel?: string;
  countries?: { code: string; weight: number; name?: string }[];
  currency?: string;
  dataSource?: string;
  holdings?: { allocationInPercentage: number; name: string; value?: number }[];
  name?: string;
  sectors?: { weight: number; name?: string; id?: string }[];
  symbol: string;
  url?: string;
}

export interface PortfolioPosition {
  activitiesCount: number;
  allocationInPercentage: number;
  assetProfile: EnhancedAssetProfile;
  dateOfFirstActivity?: Date | string;
  dividend: number;
  exchange?: string;
  grossPerformance: number;
  grossPerformancePercent: number;
  grossPerformancePercentWithCurrencyEffect: number;
  grossPerformanceWithCurrencyEffect: number;
  investment: number;
  marketChange?: number;
  marketChangePercent?: number;
  marketPrice: number;
  markets?: Record<string, number>;
  marketsAdvanced?: Record<string, number>;
  netPerformance: number;
  netPerformancePercent: number;
  netPerformancePercentWithCurrencyEffect: number;
  netPerformanceWithCurrencyEffect: number;
  quantity: number;
  tags?: Tag[];
  type?: string;
  valueInBaseCurrency?: number;
  valueInPercentage?: number;
}

// Subset of GET /api/v1/portfolio/holding/:dataSource/:symbol response
// (PortfolioHoldingResponse). We only consume the performance fields needed
// for 涨跌 / 表现 (netPerformanceWithCurrencyEffect and the matching percent).
export interface PortfolioHoldingDetail {
  netPerformance: number;
  netPerformancePercent: number;
  netPerformancePercentWithCurrencyEffect: number;
  netPerformanceWithCurrencyEffect: number;
}

export interface PortfolioHoldingsResponse {
  holdings: PortfolioPosition[];
}

export interface PortfolioDetails {
  holdings: Record<string, PortfolioPosition>;
  summary?: {
    totalValueInBaseCurrency?: number;
    filteredValueInBaseCurrency?: number;
    filteredValueInPercentage?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
