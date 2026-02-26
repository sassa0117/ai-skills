export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("ja-JP").format(num);
}

export function formatPercent(num: number): string {
  return `${num.toFixed(1)}%`;
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateForInput(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

export const TRADING_STATUS_LABELS: Record<string, string> = {
  before_listing: "出品前",
  listing: "出品中",
  sold: "売却済",
  shipped: "発送済",
  completed: "取引完了",
  cancelled: "キャンセル",
};

export const TRADING_STATUS_COLORS: Record<string, string> = {
  before_listing: "bg-gray-100 text-gray-700",
  listing: "bg-blue-100 text-blue-700",
  sold: "bg-yellow-100 text-yellow-700",
  shipped: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export function calcProfit(product: {
  sellingPrice: number;
  purchasePrice: number;
  shippingIncome: number;
  shippingCost: number;
  packagingCost: number;
  commission: number;
}) {
  const income = product.sellingPrice + product.shippingIncome;
  const expense =
    product.purchasePrice +
    product.shippingCost +
    product.packagingCost +
    product.commission;
  const profit = income - expense;
  const profitRate = income > 0 ? (profit / income) * 100 : 0;
  const costRate = income > 0 ? (expense / income) * 100 : 0;
  return { income, expense, profit, profitRate, costRate };
}

export function daysBetween(
  from: Date | string | null,
  to: Date | string | null
): number | null {
  if (!from) return null;
  const start = new Date(from);
  const end = to ? new Date(to) : new Date();
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
