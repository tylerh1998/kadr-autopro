import { format } from 'date-fns';

export const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value || 0);
};

export const formatMonth = (monthStr) => {
  const [year, month] = String(monthStr || '').split('-');
  const date = new Date(year, parseInt(month, 10) - 1);
  return format(date, 'MMM yyyy');
};

export const formatShortDate = (dateStr) => {
  try {
    const date = new Date(dateStr);
    return format(date, 'MMM d');
  } catch {
    return dateStr;
  }
};