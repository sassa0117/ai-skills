// Anilistでアニメシリーズのカバー画像とバナー画像を取得
import fs from "fs";
import path from "path";

const SERIES = [
  { year: "2004", label: "ふたりはプリキュア", search: "Futari wa Precure" },
  { year: "2005", label: "Max Heart", search: "Futari wa Precure Max Heart" },
  { year: "2006", label: "Splash☆Star", search: "Pretty Cure Splash Star" },
  { year: "2007", label: "Yes!プリキュア5", search: "Yes Precure 5" },
  { year: "2008", label: "Yes!プリキュア5 GoGo!", search: "Yes Precure 5 GoGo" },
  { year: "2009", label: "フレッシュプリキュア!", search: "Fresh Precure" },
  { year: "2010", label: "ハートキャッチプリキュア!", search: "Heartcatch Precure" },
  { year: "2011", label: "スイートプリキュア♪", search: "Suite Precure" },
  { year: "2012", label: "スマイルプリキュア!", search: "Smile Precure" },
  { year: "2013", label: "ドキドキ!プリキュア", search: "Dokidoki Precure" },
  { year: "2014", label: "ハピネスチャージプリキュア!", search: "HappinessCharge Precure" },
  { year: "2015", label: "Go!プリンセスプリキュア", search: "Princess Precure" },
  { year: "2016", label: "魔法つかいプリキュア!", search: "Mahoutsukai Precure" },
  { year: "2017", label: "キラキラ☆プリキュアアラモード", search: "Kirakira Precure" },
  { year: "2018", label: "HUGっと!プリキュア", search: "HUGtto Precure" },
  { year: "2019", label: "スター☆トゥインクルプリキュア", search: "Star Twinkle Precure" },
  { year: "2020", label: "ヒーリングっど♥プリキュア", search: "Healin Good Precure" },
  { year: "2021", label: "トロピカル〜ジュ!プリキュア", search: "Tropical Rouge Precure" },
  { year: "2022", label: "デリシャスパーティ♡プリキュア", search: "Delicious Party Precure" },
  { year: "2023", label: "ひろがるスカイ!プリキュア", search: "Hirogaru Sky Precure" },
  { year: "2024", label: "わんだふるぷりきゅあ!", search: "Wonderful Precure" },
  { year: "2025", label: "キミとアイドルプリキュア♪", search: "Idol Precure" },
  { year: "2026", label: "名探偵プリキュア", search: "Meitantei Precure" },
];

const QUERY = `query ($search: String) {
  Page(page: 1, perPage: 3) {
    media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
      id
      title { native romaji english }
      startDate { year }
      coverImage { extraLarge large color }
      bannerImage
    }
  }
}`;

async function fetchOne(search) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { search } }),
  });
  if (!res.ok) {
    console.error("  HTTP", res.status, search);
    return null;
  }
  const json = await res.json();
  return json?.data?.Page?.media || [];
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const results = [];
  for (const s of SERIES) {
    process.stdout.write(`[${s.year}] ${s.label} ... `);
    const list = await fetchOne(s.search);
    if (!list || list.length === 0) {
      console.log("not found");
      results.push({ ...s, cover: null, banner: null, color: null });
    } else {
      // 1. シリーズ年と一致 + Precure を含む TVシリーズ（Movieは除外したい）優先
      // 2. Movie優先回避（"Movie","movie","Eiga"を含む候補は後回し）
      const matchYear = parseInt(s.year, 10);
      const score = (m) => {
        const titles = [m.title.romaji, m.title.english, m.title.native].filter(Boolean).join(" ");
        let pts = 0;
        if (/Precure|プリキュア/i.test(titles)) pts += 10;
        if (m.startDate?.year === matchYear) pts += 5;
        if (m.startDate?.year && Math.abs(m.startDate.year - matchYear) <= 1) pts += 2;
        if (/Movie|movie|劇場|Eiga|: /.test(titles)) pts -= 6;
        return pts;
      };
      const sorted = [...list].sort((a, b) => score(b) - score(a));
      const best = sorted[0];
      console.log("→", best.title.romaji || best.title.native, `(${best.startDate?.year})`);
      results.push({
        ...s,
        anilistId: best.id,
        titleRomaji: best.title.romaji,
        titleNative: best.title.native,
        startYear: best.startDate?.year,
        cover: best.coverImage?.extraLarge || best.coverImage?.large || null,
        banner: best.bannerImage,
        color: best.coverImage?.color,
      });
    }
    await sleep(700);
  }

  const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..", "data", "series-images.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log("\nSaved:", out);
  console.log("Cover image hits:", results.filter(r => r.cover).length, "/", results.length);
  console.log("Banner image hits:", results.filter(r => r.banner).length, "/", results.length);
}

main();
