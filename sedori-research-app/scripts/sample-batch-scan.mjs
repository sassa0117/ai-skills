import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const pairs = [
  { n: 33, series: "鬼滅の刃", product: "隊士百景 エモーショナル缶バッジ" },
  { n: 34, series: "鬼滅の刃", product: "ぴたでふぉめ 夜の見回り 缶バッジ" },
  { n: 35, series: "HUNTER×HUNTER", product: "アニメジャパン 缶バッジ" },
  { n: 36, series: "Free!", product: "Final Stroke Golden Blossoms 缶バッジ" },
  { n: 37, series: "にじさんじ", product: "ピグパーティー BIG缶バッジ" },
  { n: 38, series: "オランピアソワレ", product: "オラソワ展 マット缶バッジ" },
  { n: 39, series: "にじさんじ", product: "IMPACT 缶バッジ" },
  { n: 40, series: "にじさんじ", product: "ウィンターデート 缶バッジ" },
  { n: 41, series: "東京エイリアンズ", product: "雨宮 缶バッジ" },
  { n: 42, series: "L DEATHNOTE", product: "推しキャラバッジコレクション" },
  { n: 43, series: "桃源暗鬼", product: "メディコス キャラウム 缶バッジコレクション" },
  { n: 44, series: "Re:ゼロから始める異世界生活", product: "カラオケの鉄人 缶バッジ" },
  { n: 45, series: "ローゼンメイデン", product: "DMM オンクレ 缶バッジ" },
  { n: 46, series: "Paradox Live", product: "極楽湯 缶バッジ" },
];

const LOG = path.join("output", "can-badge", "batch-log.txt");
fs.writeFileSync(LOG, `=== batch scan start ${new Date().toISOString()} ===\n`);

function append(s) {
  fs.appendFileSync(LOG, s + "\n");
  process.stdout.write(s + "\n");
}

async function runOne(p) {
  return new Promise((resolve) => {
    const args = [
      "scripts/sample-one-can-badge.mjs",
      "--series", p.series,
      "--product", p.product,
      "--output", `sample-${p.n}`,
    ];
    append(`\n--- sample-${p.n}: ${p.series} × ${p.product} ---`);
    const proc = spawn("node", args, { stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    proc.stdout.on("data", d => { buf += d.toString(); });
    proc.stderr.on("data", d => { buf += d.toString(); });
    proc.on("close", code => {
      fs.appendFileSync(LOG, buf);
      append(`--- sample-${p.n} exit code=${code} ---`);
      resolve();
    });
  });
}

for (const p of pairs) {
  await runOne(p);
}

append(`\n=== batch scan end ${new Date().toISOString()} ===`);
