import { format } from "date-fns";
import { ja } from "date-fns/locale";

export function formatDate(date: Date | string): string {
  return format(new Date(date), "yyyy/MM/dd", { locale: ja });
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function parseNumberWithSuffix(s: string): number {
  const trimmed = s.trim().replace(/,/g, "");
  if (trimmed.endsWith("M")) return parseFloat(trimmed) * 1_000_000;
  if (trimmed.endsWith("K")) return parseFloat(trimmed) * 1_000;
  if (trimmed.endsWith("万")) return parseFloat(trimmed) * 10_000;
  return parseFloat(trimmed) || 0;
}

export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
