"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  WIDGET_TYPE_LABELS,
  WIDGET_PERIOD_LABELS,
  WIDGET_PERIOD_RANGE_LABELS,
  WIDGET_METRIC_LABELS,
  WIDGET_DATE_FIELD_LABELS,
  TRADING_STATUS_LABELS,
} from "@/lib/utils";

interface WidgetFormProps {
  widget?: Record<string, unknown> | null;
  onSubmit: (data: Record<string, unknown>) => void;
  title: string;
}

export default function WidgetForm({ widget, onSubmit, title }: WidgetFormProps) {
  const router = useRouter();

  const [type, setType] = useState("single_value");
  const [period, setPeriod] = useState("monthly");
  const [periodRange, setPeriodRange] = useState("current");
  const [recentCount, setRecentCount] = useState(12);
  const [metric, setMetric] = useState("profit");
  const [dateField, setDateField] = useState("completionDate");
  const [tradingStatus, setTradingStatus] = useState("completed");
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    if (widget) {
      setType((widget.type as string) || "single_value");
      setPeriod((widget.period as string) || "monthly");
      setPeriodRange((widget.periodRange as string) || "current");
      setRecentCount((widget.recentCount as number) || 12);
      setMetric((widget.metric as string) || "profit");
      setDateField((widget.dateField as string) || "completionDate");
      setTradingStatus((widget.tradingStatus as string) || "completed");
      setShowComparison((widget.showComparison as boolean) || false);
    }
  }, [widget]);

  const handleSubmit = () => {
    onSubmit({
      type,
      period,
      periodRange,
      recentCount,
      metric,
      dateField,
      tradingStatus,
      showComparison,
    });
  };

  const sectionClass = "bg-white rounded-xl shadow-sm p-4 space-y-3";
  const radioClass = (selected: boolean) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors cursor-pointer ${
      selected ? "border-indigo-500 bg-indigo-50" : "border-gray-200"
    }`;
  const radioCircle = (selected: boolean) =>
    `w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
      selected ? "border-indigo-600" : "border-gray-300"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">{title}</h1>
      </div>

      {/* Display type */}
      <div className={sectionClass}>
        <h2 className="text-sm font-medium text-gray-700">数値の表示形式</h2>
        <div className="space-y-2">
          {Object.entries(WIDGET_TYPE_LABELS).map(([key, label]) => (
            <label key={key} className={radioClass(type === key)} onClick={() => setType(key)}>
              <div className={radioCircle(type === key)}>
                {type === key && (
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {key === "single_value"
                    ? "XXXX年の数値 ¥1,000,000"
                    : "棒グラフで推移を表示します"}
                </div>
              </div>
              {key === "single_value" && (
                <div className="text-right text-xs text-gray-300 font-mono">
                  ¥1,000,000
                </div>
              )}
              {key === "bar_chart" && (
                <div className="flex items-end gap-0.5 h-6">
                  {[3, 5, 2, 6, 4, 7, 3].map((h, i) => (
                    <div
                      key={i}
                      className="w-1.5 bg-indigo-300 rounded-sm"
                      style={{ height: `${h * 3}px` }}
                    />
                  ))}
                </div>
              )}
            </label>
          ))}
        </div>

        {/* Comparison toggle */}
        <label className="flex items-center justify-between px-1 py-2 cursor-pointer">
          <span className="text-sm text-gray-600">前の期間との比較を表示</span>
          <div
            className={`w-11 h-6 rounded-full transition-colors relative ${
              showComparison ? "bg-indigo-600" : "bg-gray-300"
            }`}
            onClick={() => setShowComparison(!showComparison)}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow ${
                showComparison ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </div>
        </label>
      </div>

      {/* Display period */}
      <div className={sectionClass}>
        <h2 className="text-sm font-medium text-gray-700">表示期間</h2>
        <div className="space-y-2">
          {Object.entries(WIDGET_PERIOD_LABELS).map(([key, label]) => (
            <label key={key} className={radioClass(period === key)} onClick={() => setPeriod(key)}>
              <div className={radioCircle(period === key)}>
                {period === key && (
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                )}
              </div>
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Period range */}
      <div className={sectionClass}>
        <h2 className="text-sm font-medium text-gray-700">期間範囲</h2>
        <div className="space-y-2">
          {Object.entries(WIDGET_PERIOD_RANGE_LABELS).map(([key, label]) => (
            <label key={key} className={radioClass(periodRange === key)} onClick={() => setPeriodRange(key)}>
              <div className={radioCircle(periodRange === key)}>
                {periodRange === key && (
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                )}
              </div>
              <div className="flex-1 flex items-center gap-2">
                <span className="text-sm">{label}</span>
                {key === "recent" && periodRange === "recent" && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={recentCount}
                      onChange={(e) => setRecentCount(Number(e.target.value))}
                      className="w-16 border rounded px-2 py-1 text-sm text-center"
                      min={1}
                    />
                    <span className="text-xs text-gray-500">
                      {period === "daily" ? "日" : period === "monthly" ? "ヶ月" : "年"}
                    </span>
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400 px-1">
          {periodRange === "current"
            ? period === "daily"
              ? "「現在の期間」は今月を表示します。"
              : period === "monthly"
                ? "「現在の期間」は今年を表示します。"
                : "「現在の期間」は直近の年を表示します。"
            : "「直近期間」は指定した期間分を表示します。"}
        </p>
      </div>

      {/* Metric */}
      <div className={sectionClass}>
        <h2 className="text-sm font-medium text-gray-700">表示項目</h2>
        <div className="space-y-2">
          {Object.entries(WIDGET_METRIC_LABELS).map(([key, label]) => (
            <label key={key} className={radioClass(metric === key)} onClick={() => setMetric(key)}>
              <div className={radioCircle(metric === key)}>
                {metric === key && (
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                )}
              </div>
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Date field */}
      <div className={sectionClass}>
        <h2 className="text-sm font-medium text-gray-700">集計対象日</h2>
        <div className="space-y-2">
          {Object.entries(WIDGET_DATE_FIELD_LABELS).map(([key, label]) => (
            <label key={key} className={radioClass(dateField === key)} onClick={() => setDateField(key)}>
              <div className={radioCircle(dateField === key)}>
                {dateField === key && (
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                )}
              </div>
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Trading status filter */}
      <div className={sectionClass}>
        <h2 className="text-sm font-medium text-gray-700">
          表示対象の取引ステータス
        </h2>
        <select
          value={tradingStatus}
          onChange={(e) => setTradingStatus(e.target.value)}
          className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="all">すべて</option>
          {Object.entries(TRADING_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Preview */}
      <div className="bg-gray-100 rounded-xl p-4">
        <div className="text-xs text-gray-400 mb-1">プレビュー</div>
        <div className="bg-white rounded-lg p-3">
          <div className="text-xs text-gray-500">
            {period === "daily" ? "12月" : period === "monthly" ? "2026年" : ""}
            の{WIDGET_METRIC_LABELS[metric]}
            （{TRADING_STATUS_LABELS[tradingStatus] || "すべて"}）
          </div>
          {type === "single_value" ? (
            <div className="text-2xl font-bold mt-1">¥33,691</div>
          ) : (
            <div className="flex items-end gap-1 mt-2 h-12">
              {[3, 5, 2, 6, 4, 7, 3, 5, 8, 4, 6, 2].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-indigo-400 rounded-sm"
                  style={{ height: `${h * 5}px` }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
      >
        {widget ? "更新する" : "追加する"}
      </button>
    </div>
  );
}
