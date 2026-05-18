/**
 * ScanCursor テーブルを raw SQL で新設する。
 *
 * schema-drift（CatalogItem.surugayaUrl NOT NULL違反316件）があり、
 * `prisma db push` が通らないため、ALTER 系は raw SQL で当てている。
 *
 * カーソル単位: (ipShort, category, sortMode) ごとに1行
 *   - ipShort: watchlist の IP名（例: "鬼滅の刃" "ヒロアカ"）
 *   - category: 駿屋カテゴリID（例: "501"=ホビー）。NULL = カテゴリ無指定の全件
 *   - sortMode: 'new' or 'release'
 *
 * 使い方:
 *   node scripts/setup-scan-cursor.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(PROJECT_ROOT, "dev.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS ScanCursor (
    id TEXT PRIMARY KEY,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,

    ipShort   TEXT NOT NULL,
    category  TEXT,
    sortMode  TEXT NOT NULL DEFAULT 'release',

    lastPage      INTEGER NOT NULL DEFAULT 0,
    lastPageAt    TEXT,
    totalHits     INTEGER NOT NULL DEFAULT 0,
    itemsScanned  INTEGER NOT NULL DEFAULT 0,
    newLastRun    INTEGER NOT NULL DEFAULT 0,
    isExhausted   INTEGER NOT NULL DEFAULT 0,

    note TEXT
  );
`);

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS ScanCursor_unique
    ON ScanCursor(ipShort, COALESCE(category, ''), sortMode);
`);

db.exec(`CREATE INDEX IF NOT EXISTS ScanCursor_ipShort ON ScanCursor(ipShort);`);
db.exec(`CREATE INDEX IF NOT EXISTS ScanCursor_isExhausted ON ScanCursor(isExhausted);`);

const row = db.prepare("SELECT COUNT(*) AS c FROM ScanCursor").get();
console.log(`ScanCursor ready. rows=${row.c}`);

db.close();
