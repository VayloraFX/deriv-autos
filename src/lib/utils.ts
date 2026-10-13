import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBalance(balance: number | string, currency = 'USD'): string {
  const num = typeof balance === 'number' ? balance : parseFloat(balance);
  if (isNaN(num)) return `0.00 ${currency}`;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
