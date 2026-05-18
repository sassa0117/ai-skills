/**
 * IPイベントデータのシード
 * アニメ放送期間・映画公開・漫画完結等
 */
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "dev.db");

function cuid() {
  return `c${Date.now().toString(36)}${crypto.randomBytes(8).toString("hex")}`;
}

const events = [
  // 鬼滅の刃
  { ipTitle: "鬼滅の刃", ipShort: "鬼滅の刃", eventType: "anime_start", eventLabel: "1期放送開始", startDate: "2019-04-06", endDate: "2019-09-28" },
  { ipTitle: "鬼滅の刃", ipShort: "鬼滅の刃", eventType: "movie", eventLabel: "無限列車編 公開", startDate: "2020-10-16" },
  { ipTitle: "鬼滅の刃", ipShort: "鬼滅の刃", eventType: "anime_start", eventLabel: "遊郭編 放送", startDate: "2021-12-05", endDate: "2022-02-13" },
  { ipTitle: "鬼滅の刃", ipShort: "鬼滅の刃", eventType: "anime_start", eventLabel: "刀鍛冶の里編 放送", startDate: "2023-04-09", endDate: "2023-06-18" },
  { ipTitle: "鬼滅の刃", ipShort: "鬼滅の刃", eventType: "anime_start", eventLabel: "柱稽古編 放送", startDate: "2024-05-12", endDate: "2024-06-30" },
  { ipTitle: "鬼滅の刃", ipShort: "鬼滅の刃", eventType: "movie", eventLabel: "無限城編 前編公開", startDate: "2025-10-10" },
  { ipTitle: "鬼滅の刃", ipShort: "鬼滅の刃", eventType: "manga_end", eventLabel: "漫画完結", startDate: "2020-05-18" },

  // 呪術廻戦
  { ipTitle: "呪術廻戦", ipShort: "呪術廻戦", eventType: "anime_start", eventLabel: "1期放送", startDate: "2020-10-03", endDate: "2021-03-27" },
  { ipTitle: "呪術廻戦", ipShort: "呪術廻戦", eventType: "movie", eventLabel: "劇場版0 公開", startDate: "2021-12-24" },
  { ipTitle: "呪術廻戦", ipShort: "呪術廻戦", eventType: "anime_start", eventLabel: "2期 懐玉・玉折/渋谷事変", startDate: "2023-07-06", endDate: "2023-12-28" },
  { ipTitle: "呪術廻戦", ipShort: "呪術廻戦", eventType: "manga_end", eventLabel: "漫画完結", startDate: "2024-09-30" },
  { ipTitle: "呪術廻戦", ipShort: "呪術廻戦", eventType: "exhibition", eventLabel: "呪術廻戦展", startDate: "2024-07-06", endDate: "2024-09-01" },

  // チェンソーマン
  { ipTitle: "チェンソーマン", ipShort: "チェンソーマン", eventType: "anime_start", eventLabel: "1期放送", startDate: "2022-10-12", endDate: "2022-12-28" },
  { ipTitle: "チェンソーマン", ipShort: "チェンソーマン", eventType: "movie", eventLabel: "劇場版レゼ篇 公開", startDate: "2025-06-27" },
  { ipTitle: "チェンソーマン", ipShort: "チェンソーマン", eventType: "manga_end", eventLabel: "第1部完結", startDate: "2020-12-14" },

  // SPY×FAMILY
  { ipTitle: "SPY×FAMILY", ipShort: "SPY×FAMILY", eventType: "anime_start", eventLabel: "1期 Part1", startDate: "2022-04-09", endDate: "2022-06-25" },
  { ipTitle: "SPY×FAMILY", ipShort: "SPY×FAMILY", eventType: "anime_start", eventLabel: "1期 Part2", startDate: "2022-10-01", endDate: "2022-12-24" },
  { ipTitle: "SPY×FAMILY", ipShort: "SPY×FAMILY", eventType: "anime_start", eventLabel: "Season2", startDate: "2023-10-07", endDate: "2023-12-23" },
  { ipTitle: "SPY×FAMILY", ipShort: "SPY×FAMILY", eventType: "movie", eventLabel: "CODE: White 公開", startDate: "2023-12-22" },

  // 僕のヒーローアカデミア
  { ipTitle: "僕のヒーローアカデミア", ipShort: "僕のヒーローアカデミア", eventType: "anime_start", eventLabel: "7期放送", startDate: "2024-05-04", endDate: "2024-10-12" },
  { ipTitle: "僕のヒーローアカデミア", ipShort: "僕のヒーローアカデミア", eventType: "manga_end", eventLabel: "漫画完結", startDate: "2024-08-05" },
  { ipTitle: "僕のヒーローアカデミア", ipShort: "僕のヒーローアカデミア", eventType: "movie", eventLabel: "ユアネクスト公開", startDate: "2024-08-02" },
  { ipTitle: "僕のヒーローアカデミア", ipShort: "僕のヒーローアカデミア", eventType: "exhibition", eventLabel: "原画展", startDate: "2024-04-27", endDate: "2025-12-31" },

  // 推しの子
  { ipTitle: "推しの子", ipShort: "推しの子", eventType: "anime_start", eventLabel: "1期放送", startDate: "2023-04-12", endDate: "2023-06-28" },
  { ipTitle: "推しの子", ipShort: "推しの子", eventType: "anime_start", eventLabel: "2期放送", startDate: "2024-07-03", endDate: "2024-09-25" },
  { ipTitle: "推しの子", ipShort: "推しの子", eventType: "manga_end", eventLabel: "漫画完結", startDate: "2024-08-14" },

  // ダンダダン
  { ipTitle: "ダンダダン", ipShort: "ダンダダン", eventType: "anime_start", eventLabel: "1期放送", startDate: "2024-10-04", endDate: "2024-12-20" },
  { ipTitle: "ダンダダン", ipShort: "ダンダダン", eventType: "anime_start", eventLabel: "2期放送", startDate: "2025-04-04", endDate: "2025-06-27" },

  // ブルーロック
  { ipTitle: "ブルーロック", ipShort: "ブルーロック", eventType: "anime_start", eventLabel: "1期放送", startDate: "2022-10-09", endDate: "2023-03-26" },
  { ipTitle: "ブルーロック", ipShort: "ブルーロック", eventType: "anime_start", eventLabel: "2期放送", startDate: "2024-10-05", endDate: "2025-03-29" },
  { ipTitle: "ブルーロック", ipShort: "ブルーロック", eventType: "movie", eventLabel: "劇場版公開", startDate: "2025-04-18" },

  // ハイキュー
  { ipTitle: "ハイキュー!!", ipShort: "ハイキュー", eventType: "manga_end", eventLabel: "漫画完結", startDate: "2020-07-20" },
  { ipTitle: "ハイキュー!!", ipShort: "ハイキュー", eventType: "movie", eventLabel: "ゴミ捨て場の決戦 公開", startDate: "2024-02-16" },

  // 東京リベンジャーズ
  { ipTitle: "東京卍リベンジャーズ", ipShort: "東京リベンジャーズ", eventType: "anime_start", eventLabel: "1期放送", startDate: "2021-04-11", endDate: "2021-09-19" },
  { ipTitle: "東京卍リベンジャーズ", ipShort: "東京リベンジャーズ", eventType: "anime_start", eventLabel: "天竺編 放送", startDate: "2023-10-04", endDate: "2023-12-20" },
  { ipTitle: "東京卍リベンジャーズ", ipShort: "東京リベンジャーズ", eventType: "manga_end", eventLabel: "漫画完結", startDate: "2022-11-16" },

  // かぐや様は告らせたい
  { ipTitle: "かぐや様は告らせたい", ipShort: "かぐや様は告らせたい", eventType: "anime_start", eventLabel: "1期放送", startDate: "2019-01-12", endDate: "2019-03-30" },
  { ipTitle: "かぐや様は告らせたい", ipShort: "かぐや様は告らせたい", eventType: "anime_start", eventLabel: "3期放送", startDate: "2022-04-09", endDate: "2022-06-25" },
  { ipTitle: "かぐや様は告らせたい", ipShort: "かぐや様は告らせたい", eventType: "manga_end", eventLabel: "漫画完結", startDate: "2022-11-02" },
  { ipTitle: "かぐや様は告らせたい", ipShort: "かぐや様は告らせたい", eventType: "anime_start", eventLabel: "新作放送", startDate: "2026-01-01", endDate: "2026-03-31" },

  // 炎炎ノ消防隊
  { ipTitle: "炎炎ノ消防隊", ipShort: "炎炎ノ消防隊", eventType: "anime_start", eventLabel: "1期放送", startDate: "2019-07-06", endDate: "2019-12-28" },
  { ipTitle: "炎炎ノ消防隊", ipShort: "炎炎ノ消防隊", eventType: "anime_start", eventLabel: "3期放送", startDate: "2026-01-01", endDate: "2026-03-31" },
  { ipTitle: "炎炎ノ消防隊", ipShort: "炎炎ノ消防隊", eventType: "manga_end", eventLabel: "漫画完結", startDate: "2022-02-22" },

  // メダリスト
  { ipTitle: "メダリスト", ipShort: "メダリスト", eventType: "anime_start", eventLabel: "1期放送", startDate: "2025-01-05", endDate: "2025-03-30" },
  { ipTitle: "メダリスト", ipShort: "メダリスト", eventType: "anime_start", eventLabel: "2期放送", startDate: "2026-01-01", endDate: "2026-03-31" },
  { ipTitle: "メダリスト", ipShort: "メダリスト", eventType: "exhibition", eventLabel: "メダリスト展", startDate: "2025-03-01", endDate: "2025-04-30" },

  // アンデッドアンラック
  { ipTitle: "アンデッドアンラック", ipShort: "アンデッドアンラック", eventType: "anime_start", eventLabel: "1期放送", startDate: "2023-10-07", endDate: "2024-03-23" },
  { ipTitle: "アンデッドアンラック", ipShort: "アンデッドアンラック", eventType: "anime_start", eventLabel: "2期放送", startDate: "2026-01-01", endDate: "2026-03-31" },

  // 魔都精兵のスレイブ
  { ipTitle: "魔都精兵のスレイブ", ipShort: "魔都精兵のスレイブ", eventType: "anime_start", eventLabel: "1期放送", startDate: "2024-01-12", endDate: "2024-03-29" },
  { ipTitle: "魔都精兵のスレイブ", ipShort: "魔都精兵のスレイブ", eventType: "anime_start", eventLabel: "2期放送", startDate: "2026-01-01", endDate: "2026-03-31" },

  // Fate/strange Fake
  { ipTitle: "Fate/strange Fake", ipShort: "Fate/strange Fake", eventType: "anime_start", eventLabel: "放送", startDate: "2026-01-01", endDate: "2026-03-31" },
];

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
const now = new Date().toISOString();

const insert = db.prepare(`
  INSERT INTO IpEvent (id, createdAt, ipTitle, ipShort, eventType, eventLabel, startDate, endDate)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const tx = db.transaction(() => {
  db.prepare("DELETE FROM IpEvent").run();
  for (const e of events) {
    insert.run(cuid(), now, e.ipTitle, e.ipShort, e.eventType, e.eventLabel, e.startDate, e.endDate || null);
  }
});
tx();

console.log(`${events.length}件のイベントをシード完了`);
db.close();
