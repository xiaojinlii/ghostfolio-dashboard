import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a base-currency money value as "$1,234.00" (no locale-specific "US$"
 * prefix). Ghostfolio returns valueInBaseCurrency in the user's base currency,
 * so a plain "$" symbol is the right universal rendering here.
 */
export function fmtMoney(n: number | undefined): string {
  if (n === undefined) return '—';
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n)}`;
}

/**
 * Format a signed money value as "$+1,234.00" / "$-1,234.00" for the 涨跌 column.
 * The sign is always shown so the +/- aligns with the color coding.
 */
export function fmtMoneySigned(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  return `${sign}$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(n))}`;
}
