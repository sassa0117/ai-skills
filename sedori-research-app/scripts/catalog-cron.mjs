/**
 * グッズカタログ 定期実行スクリプト
 *
 * ウォッチリストを一括スキャン → DB保存 → 高騰検知 → Discord通知
 *
 * 使い方:
 *   node scripts/catalog-cron.mjs
 *
 * Windowsタスクスケジューラで週2回実行する想定。
 * catalog-cron.bat から呼ばれる。
 */

import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import Database from "better-sqlite3";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_ROOT, "dev.db");

// Discord Webhook（メモリから）
const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1471121436130279475/b3DGIXUKz7WRYT4oIlzuz8Qi9K8XYeW_6F0uAsWKzETlrgsFZrRMNpkr3G0xxypM7b6z";

const LOG_PATH = path.join(PROJECT_ROOT, "logs");

// ========================================
// ログ
// ========================================
function ensureLogDir() {
  if (!fs.existsSync(LOG_PATH)) fs.mkdirSync(LOG_PATH, { recursive: true });
}

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
  const line = `[${ts}] ${msg}`;
  console.log(line);
  ensureLogDir();
  const logFile = path.join(LOG_PATH, `catalog-${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(logFile, line + "\n");
}

// ========================================
// 高騰検知（前回スナップショットと比較）
// ========================================
function detectRising() {
  const db = new Database(DB_PATH, { readonly: true });

  // 2回以上スナップショットがある商品で、最新のメルカリ中央値が前回より上がってるもの
  const rows = db.prepare(`
    SELECT
      ci.name, ci.ipShort, ci.surugayaUrl,
      curr.mercariMedian as currMedian,
      curr.surugayaPrice as currSurugaya,
      prev.mercariMedian as prevMedian,
      curr.createdAt as currDate,
      prev.createdAt as prevDate
    FROM CatalogItem ci
    JOIN PriceSnapshot curr ON curr.itemId = ci.id
    JOIN PriceSnapshot prev ON prev.itemId = ci.id
    WHERE curr.createdAt = (SELECT MAX(createdAt) FROM PriceSnapshot WHERE itemId = ci.id)
      AND prev.createdAt = (
        SELECT MAX(createdAt) FROM PriceSnapshot
        WHERE itemId = ci.id AND createdAt < curr.createdAt
      )
      AND curr.mercariMedian IS NOT NULL
      AND prev.mercariMedian IS NOT NULL
      AND curr.mercariMedian > prev.mercariMedian
    ORDER BY (CAST(curr.mercariMedian - prev.mercariMedian AS REAL) / prev.mercariMedian) DESC
  `).all();

  db.close();

  // 10%以上の上昇のみ
  const rising = rows
    .map(r => ({
      ...r,
      changePercent: Math.round(((r.currMedian - r.prevMedian) / r.prevMedian) * 100),
    }))
    .filter(r => r.changePercent >= 10);

  return rising;
}

/**
 * メルカリsoldの週間推移から高騰を検知
 * （スナップショットが1回しかなくても検知可能）
 */
function detectWeeklyRising() {
  const db = new Database(DB_PATH, { readonly: true });

  const rows = db.prepare(`
    SELECT
      ci.name, ci.ipShort, ci.surugayaUrl,
      ps.mercariMedian, ps.surugayaPrice, ps.weeklyTrend, ps.trendDirection
    FROM CatalogItem ci
    JOIN PriceSnapshot ps ON ps.itemId = ci.id
    WHERE ps.createdAt = (SELECT MAX(createdAt) FROM PriceSnapshot WHERE itemId = ci.id)
      AND ps.trendDirection IS NOT NULL
      AND ps.trendDirection >= 15
      AND ps.mercariMedian IS NOT NULL
    ORDER BY ps.trendDirection DESC
  `).all();

  db.close();
  return rows;
}

// ========================================
// watchlist 自動追加IP（直近24時間）
// ========================================
function readAutoAddedRecent() {
  const logPath = path.join(LOG_PATH, "ip-fetch-added.json");
  if (!fs.existsSync(logPath)) return [];
  try {
    const history = JSON.parse(fs.readFileSync(logPath, "utf-8"));
    if (!Array.isArray(history)) return [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = history.filter((h) => new Date(h.at).getTime() >= cutoff);
    const ips = [];
    recent.forEach((h) => (h.entries || []).forEach((e) => ips.push(e)));
    return ips;
  } catch {
    return [];
  }
}

// ========================================
// 新規取り込み集計（直近24時間）
// ========================================
function summarizeNewItems() {
  const db = new Database(DB_PATH, { readonly: true });

  const total = db.prepare(`
    SELECT COUNT(*) as cnt FROM CatalogItem
    WHERE createdAt >= datetime('now','-24 hours')
  `).get().cnt;

  const byIp = db.prepare(`
    SELECT COALESCE(NULLIF(ipShort,''),'(未分類)') as ip, COUNT(*) as cnt
    FROM CatalogItem
    WHERE createdAt >= datetime('now','-24 hours')
    GROUP BY ip
    ORDER BY cnt DESC
    LIMIT 5
  `).all();

  const byType = db.prepare(`
    SELECT COALESCE(NULLIF(productType,''),'(未分類)') as type, COUNT(*) as cnt
    FROM CatalogItem
    WHERE createdAt >= datetime('now','-24 hours')
    GROUP BY type
    ORDER BY cnt DESC
    LIMIT 5
  `).all();

  db.close();
  return { total, byIp, byType };
}

// ========================================
// Discord通知
// ========================================
const DISCORD_MAX = 1900; // Discord 2000字制限の安全マージン

async function notifyDiscord(message) {
  const content = message.length > DISCORD_MAX
    ? message.slice(0, DISCORD_MAX) + "\n…（長すぎるため省略）"
    : message;
  try {
    const res = await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log(`Discord通知失敗 status=${res.status} body=${body.slice(0, 200)}`);
    }
  } catch (e) {
    log(`Discord通知失敗: ${e.message}`);
  }
}

// ========================================
// メイン
// ========================================
async function main() {
  const skipScan = process.argv.includes("--skip-scan");
  log(`=== グッズカタログ定期実行 開始 ${skipScan ? "(スキャンskip)" : ""} ===`);

  // Step 1: ウォッチリスト一括スキャン（--skip-scan 時はスキップ）
  if (!skipScan) {
    try {
      log("ウォッチリスト一括スキャン開始...");
      const result = execSync(
        `node "${path.join(__dirname, "surugaya-catalog.mjs")}" --watchlist`,
        {
          cwd: PROJECT_ROOT,
          timeout: 30 * 60 * 1000, // 30分タイムアウト
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      // 最終行あたりから合計を抽出
      const totalMatch = result.match(/合計: (\d+)件\s+注目: (\d+)件/);
      if (totalMatch) {
        log(`スキャン完了: ${totalMatch[1]}件取得, 注目${totalMatch[2]}件`);
      } else {
        log("スキャン完了（サマリー抽出不可）");
      }

      // ログ保存
      ensureLogDir();
      const scanLog = path.join(LOG_PATH, `scan-${new Date().toISOString().slice(0, 10)}.log`);
      fs.writeFileSync(scanLog, result, "utf-8");

    } catch (e) {
      log(`スキャンエラー: ${e.message}`);
      await notifyDiscord(`⚠️ グッズカタログ定期スキャン失敗\n${e.message.slice(0, 200)}`);
      return;
    }
  } else {
    log("スキャンskip（nightly-full.bat 等から呼び出し時の二重実行回避）");
  }

  // Step 2: 高騰検知
  log("高騰検知中...");

  const rising = detectRising();
  const weeklyRising = detectWeeklyRising();

  log(`スナップショット間の上昇: ${rising.length}件`);
  log(`メルカリsold週間上昇: ${weeklyRising.length}件`);

  // Step 3: Discord通知
  const lines = [];

  // 新規取り込みサマリ（先頭に必ず出す）
  const fresh = summarizeNewItems();
  log(`新規取り込み（直近24h）: ${fresh.total}件`);
  lines.push(`📦 **新規取り込み（直近24h）: ${fresh.total.toLocaleString()}件**`);
  if (fresh.byIp.length > 0) {
    const ipLine = fresh.byIp.map(r => `${r.ip}(${r.cnt})`).join(" / ");
    lines.push(`  上位IP: ${ipLine}`);
  }
  if (fresh.byType.length > 0) {
    const typeLine = fresh.byType.map(r => `${r.type}(${r.cnt})`).join(" / ");
    lines.push(`  上位種別: ${typeLine}`);
  }
  lines.push("");

  // 自動追加IP（直近24h）
  const autoAdded = readAutoAddedRecent();
  log(`watchlist自動追加（直近24h）: ${autoAdded.length}IP`);
  if (autoAdded.length > 0) {
    lines.push(`🆕 **watchlist自動追加: ${autoAdded.length}IP**`);
    autoAdded.slice(0, 10).forEach((e) => {
      const tag = e.isSequel ? "②続編" : "③新規";
      lines.push(`  [${tag}] ${e.ip}`);
    });
    if (autoAdded.length > 10) lines.push(`  ...他${autoAdded.length - 10}件`);
    lines.push("");
  }

  if (rising.length > 0) {
    lines.push("📈 **スナップショット間で価格上昇**");
    for (const r of rising.slice(0, 10)) {
      lines.push(`  +${r.changePercent}%  ¥${r.prevMedian.toLocaleString()} → ¥${r.currMedian.toLocaleString()}  ${r.name.slice(0, 40)}`);
    }
    if (rising.length > 10) lines.push(`  ...他${rising.length - 10}件`);
  }

  if (weeklyRising.length > 0) {
    lines.push("");
    lines.push("🔥 **メルカリsold週間トレンド上昇（+15%↑）**");
    for (const r of weeklyRising.slice(0, 10)) {
      const sp = r.surugayaPrice ? `駿¥${r.surugayaPrice.toLocaleString()}` : "";
      lines.push(`  +${r.trendDirection}%  メ¥${r.mercariMedian.toLocaleString()} ${sp}  ${r.name.slice(0, 40)}`);
    }
    if (weeklyRising.length > 10) lines.push(`  ...他${weeklyRising.length - 10}件`);
  }

  if (rising.length === 0 && weeklyRising.length === 0) {
    lines.push("📊 高騰検知なし");
  }

  const msg = `**グッズカタログ定期レポート** (${new Date().toISOString().slice(0, 10)})\n\n${lines.join("\n")}`;
  await notifyDiscord(msg);
  log("Discord通知送信済み");

  log("=== 定期実行 完了 ===");
}

main().catch(e => {
  log(`致命的エラー: ${e.message}`);
  process.exit(1);
});
