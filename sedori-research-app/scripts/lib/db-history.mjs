/**
 * UPDATE時に旧値を <column>_history JSON カラムに append する補助。
 *
 * 設計意図:
 *   2026-05-23 comic-cleanup 事故 (Group DELETE→列省略INSERT で書影/ASIN/wiki/rank/価格メタ 16列消失)
 *   の再発防止層。UPDATE自体は防げないが、上書き前の値を JSON 配列で保存しておけば
 *   バグ訂正・誤UPDATE復旧が可能になる。
 *
 * 使い方:
 *   ensureHistoryColumn(db, table, column);  // ALTER ADD COLUMN <column>_history TEXT (冪等)
 *   updateWithHistory(db, table, id, column, newValue, reason);
 *
 * _history 形式: [{ "ts": "ISO8601", "value": <previous>, "reason": "<short>" }, ...]
 * 直近30件まで保持 (古いものから捨てる)。
 */

const MAX_HISTORY = 30;

export function ensureHistoryColumn(db, table, column) {
  const histCol = `${column}_history`;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === histCol)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${histCol} TEXT`);
  return true;
}

export function updateWithHistory(db, table, id, column, newValue, reason = "update") {
  const histCol = `${column}_history`;
  const row = db.prepare(`SELECT ${column} as cur, ${histCol} as hist FROM ${table} WHERE id = ?`).get(id);
  if (!row) return { changed: 0 };
  if (row.cur === newValue) return { changed: 0, reason: "same" };
  const history = (() => {
    if (!row.hist) return [];
    try { return JSON.parse(row.hist); } catch { return []; }
  })();
  history.push({ ts: new Date().toISOString(), value: row.cur, reason });
  while (history.length > MAX_HISTORY) history.shift();
  const stmt = db.prepare(`UPDATE ${table} SET ${column} = ?, ${histCol} = ? WHERE id = ?`);
  const r = stmt.run(newValue, JSON.stringify(history), id);
  return { changed: r.changes, prev: row.cur };
}

/**
 * 一括 ensure: 各 (table, columns[]) ペアに対し全 column の history を作る。
 * scan/data-fixes スクリプトの起動時に1回呼ぶ想定。
 */
export function ensureHistoryColumns(db, plan) {
  const added = [];
  for (const { table, columns } of plan) {
    for (const c of columns) {
      if (ensureHistoryColumn(db, table, c)) added.push(`${table}.${c}_history`);
    }
  }
  return added;
}

export const DEFAULT_HISTORY_PLAN = [
  { table: "ComicFirstPrintGroup", columns: ["ipName", "coverUrl", "asin", "priceMedian", "tags"] },
  { table: "WeeklyMagazineGroup", columns: ["coverIP", "priceMedian", "issueNumber"] },
];
