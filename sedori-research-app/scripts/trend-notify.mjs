/**
 * アニメグッズ相場トレンド定期チェック＋Discord通知スクリプト
 *
 * 使い方:
 *   node scripts/trend-notify.mjs
 *
 * 環境変数:
 *   DISCORD_WEBHOOK_URL - Discord Webhook URL（未指定時はデフォルト使用）
 *   MIN_CHANGE_PERCENT  - 通知する最低上昇率（デフォルト: 10）
 *   APP_URL             - アプリのURL（デフォルト: http://localhost:3000）
 *
 * 定期実行（タスクスケジューラ or cron）:
 *   毎朝9時に実行推奨
 */

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL ||
  "https://discord.com/api/webhooks/1471121436130279475/b3DGIXUKz7WRYT4oIlzuz8Qi9K8XYeW_6F0uAsWKzETlrgsFZrRMNpkr3G0xxypM7b6z";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const MIN_CHANGE = parseInt(process.env.MIN_CHANGE_PERCENT || "10", 10);

async function main() {
  console.log("=== アニメグッズ相場トレンドスキャン開始 ===");
  console.log(`最低上昇率: ${MIN_CHANGE}%`);

  // 1. スキャン開始
  let scanId;
  try {
    const res = await fetch(`${APP_URL}/api/trend/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minChangePercent: MIN_CHANGE }),
    });
    const data = await res.json();
    scanId = data.scanId;
    console.log(`スキャンID: ${scanId}`);
  } catch (e) {
    console.error("スキャン開始失敗:", e.message);
    await sendDiscord("⚠️ トレンドスキャン開始に失敗しました\n" + e.message);
    process.exit(1);
  }

  // 2. 完了までポーリング（最大10分）
  const maxWait = 10 * 60 * 1000;
  const start = Date.now();
  let scanResult;

  while (Date.now() - start < maxWait) {
    await sleep(10000); // 10秒間隔

    try {
      const res = await fetch(`${APP_URL}/api/trend/results?scanId=${scanId}&minChange=${MIN_CHANGE}`);
      const data = await res.json();

      if (data.scan?.status === "completed") {
        scanResult = data;
        break;
      } else if (data.scan?.status === "failed") {
        console.error("スキャン失敗:", data.scan.error);
        await sendDiscord("⚠️ トレンドスキャン失敗\n" + (data.scan.error || "不明なエラー"));
        process.exit(1);
      }

      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`待機中... (${elapsed}秒経過)`);
    } catch {
      // retry
    }
  }

  if (!scanResult) {
    console.error("タイムアウト");
    await sendDiscord("⚠️ トレンドスキャンがタイムアウトしました（10分）");
    process.exit(1);
  }

  // 3. 結果をDiscordに通知
  const results = scanResult.results || [];
  console.log(`検知結果: ${results.length}件`);

  if (results.length === 0) {
    console.log("上昇トレンドなし");
    // 上昇なしの場合は通知しない（静かに終了）
    return;
  }

  // Discord通知を構築
  const embeds = [];

  // サマリー
  const topResults = results.slice(0, 10);
  let description = topResults
    .map((r, i) => {
      const arrow = r.changePercent >= 30 ? "🔥" : r.changePercent >= 15 ? "📈" : "↗️";
      const news = r.news ? ` [${r.news.newsType}]` : "";
      return `${i + 1}. ${arrow} **${r.ipTitle}** ${r.goodsType} — **+${r.changePercent}%**\n` +
        `　¥${r.olderMedian.toLocaleString()} → ¥${r.recentMedian.toLocaleString()}${news}`;
    })
    .join("\n\n");

  if (results.length > 10) {
    description += `\n\n...他${results.length - 10}件`;
  }

  embeds.push({
    title: `📊 アニメグッズ相場トレンド（${results.length}件検知）`,
    description,
    color: 0xff4444,
    footer: {
      text: `スキャン: ${new Date(scanResult.scan.createdAt).toLocaleString("ja-JP")} | ニュース: ${scanResult.scan.newsCount}件`,
    },
  });

  await sendDiscord(null, embeds);
  console.log("=== Discord通知完了 ===");
}

async function sendDiscord(content, embeds) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content || undefined,
        embeds: embeds || undefined,
      }),
    });
  } catch (e) {
    console.error("Discord通知失敗:", e.message);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error("致命的エラー:", e);
  process.exit(1);
});
