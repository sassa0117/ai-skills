#!/usr/bin/env node

import { parseArgs } from "node:util";
import { parseSource } from "./source/parser.js";
import { transform, antiAiCheck } from "./transform/engine.js";
import { writeOutput } from "./output/writer.js";
import { openPreview } from "./output/preview.js";
import { createProfile, PLATFORMS, validateApiKey } from "./config.js";
import { generateVideo } from "./video/index.js";

// --- プラットフォームモジュール動的読み込み ---
async function loadPlatform(name) {
  const mod = await import(`./transform/platforms/${name}.js`);
  return mod;
}

// --- CLI引数パース ---
function parseCLIArgs() {
  const { values } = parseArgs({
    options: {
      source: { type: "string", short: "s" },
      platforms: { type: "string", short: "p" },
      genre: { type: "string", short: "g" },
      persona: { type: "string" },
      preview: { type: "boolean", default: false },
      "no-ai-check": { type: "boolean", default: false },
      "skip-video": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
  });

  if (values.help || !values.source) {
    printUsage();
    process.exit(values.help ? 0 : 1);
  }

  // プラットフォーム解析
  let platformList;
  if (!values.platforms || values.platforms === "all") {
    platformList = ["threads", "note", "x"];
  } else {
    platformList = values.platforms.split(",").map((p) => p.trim().toLowerCase());
    const invalid = platformList.filter((p) => !PLATFORMS.includes(p));
    if (invalid.length > 0) {
      console.error(`[ERROR] 未対応プラットフォーム: ${invalid.join(", ")}`);
      console.error(`対応: ${PLATFORMS.join(", ")}`);
      process.exit(1);
    }
  }

  return {
    source: values.source,
    platforms: platformList,
    genre: values.genre || null,
    persona: values.persona || null,
    preview: values.preview || false,
    skipAiCheck: values["no-ai-check"] || false,
    skipVideo: values["skip-video"] || false,
  };
}

function printUsage() {
  console.log(`
Content Engine - ブログ記事 → SNS最適化コンテンツ変換

使い方:
  node src/index.js --source <ソース> --platforms <プラットフォーム>

ソース:
  --source, -s    記事URL / "記事ID:123" / ファイルパス / テキスト直接入力

プラットフォーム:
  --platforms, -p  threads,note,x,youtube,instagram （カンマ区切り / "all"）
                   省略時: threads,note,x

オプション:
  --genre, -g      ジャンル上書き（デフォルト: せどり）
  --persona        ペルソナ上書き（デフォルト: さっさ）
  --preview        生成後にブラウザプレビューを開く
  --no-ai-check    AI臭チェックをスキップ
  --skip-video     YouTube台本のみ生成（スライド画像・動画合成をスキップ）
  --help, -h       このヘルプを表示

例:
  node src/index.js --source "https://sedorisassa.com/xxxx" --platforms threads,note,x
  node src/index.js --source "./article.txt" --platforms threads --genre "平成レトロ"
  node src/index.js --source "記事ID:123" --platforms all --preview
`);
}

// --- メイン処理 ---
async function main() {
  const args = parseCLIArgs();

  // APIキーチェック（ヘルプ表示後に実行）
  validateApiKey();

  console.log("=".repeat(60));
  console.log("Content Engine v1.0.0");
  console.log("=".repeat(60));

  // 1. ソースパース
  console.log(`\n[1/4] ソース読み込み中...`);
  console.log(`  入力: ${args.source.slice(0, 80)}${args.source.length > 80 ? "..." : ""}`);

  let sourceData;
  try {
    sourceData = await parseSource(args.source);
  } catch (err) {
    console.error(`[ERROR] ソースの読み込みに失敗: ${err.message}`);
    process.exit(1);
  }

  console.log(`  タイトル: ${sourceData.title}`);
  console.log(`  タイプ: ${sourceData.sourceType}`);
  console.log(`  本文: ${sourceData.content.length}文字`);

  // 2. プロファイル設定
  const profileOverrides = {};
  if (args.genre) {
    profileOverrides.genre = args.genre;
    profileOverrides.description = `${args.genre}ジャンルのコンテンツ`;
  }
  if (args.persona) {
    profileOverrides.persona = args.persona;
  }
  // ジャンルが変わった場合、デフォルトの文体スキルを外す
  if (args.genre && args.genre !== "せどり") {
    profileOverrides.writingStyle = "generic";
  }
  const profile = createProfile(profileOverrides);

  console.log(`\n[2/4] プロファイル`);
  console.log(`  ジャンル: ${profile.genre}`);
  console.log(`  ペルソナ: ${profile.persona}`);
  console.log(`  文体: ${profile.writingStyle}`);

  // 3. 各プラットフォームで変換
  console.log(`\n[3/4] コンテンツ変換中...`);
  console.log(`  対象: ${args.platforms.join(", ")}`);

  const results = {};

  let videoResult = null; // YouTube動画パイプラインの結果

  for (const platformName of args.platforms) {
    process.stdout.write(`  ${platformName}... `);

    try {
      const platform = await loadPlatform(platformName);
      const platformPrompt = platform.getPrompt();

      // Claude APIで変換
      let text = await transform({
        sourceContent: sourceData.structure || sourceData.content,
        sourceTitle: sourceData.title,
        platformPrompt,
        platformName: platform.label || platformName,
        profile,
      });

      // YouTube以外はAI臭チェック（YouTubeはJSON出力なのでスキップ）
      if (!args.skipAiCheck && platformName !== "youtube") {
        process.stdout.write("(AI臭チェック中...) ");
        text = await antiAiCheck(text, platform.label || platformName);
      }

      results[platformName] = {
        text,
        extension: platform.extension || "txt",
        label: platform.label || platformName,
      };

      console.log(`OK (${text.length}文字)`);

      // YouTube: 台本生成後にスライド画像→動画合成パイプライン実行
      if (platformName === "youtube") {
        console.log(`\n  YouTube動画パイプライン開始...`);
        try {
          videoResult = await generateVideo({
            scriptText: text,
            skipVideo: args.skipVideo,
          });
          console.log(`  YouTube動画パイプライン完了`);
          if (videoResult.videoPath) {
            console.log(`  動画: ${videoResult.videoPath}`);
          }
          console.log(`  スライド画像: ${videoResult.slidePaths.length}枚`);
        } catch (videoErr) {
          console.error(`  [WARN] 動画生成でエラー: ${videoErr.message}`);
          console.error(`  台本JSONは正常に出力されています。`);
        }
      }
    } catch (err) {
      console.log(`FAILED`);
      console.error(`    エラー: ${err.message}`);
      results[platformName] = {
        text: `[ERROR] 変換失敗: ${err.message}`,
        extension: "txt",
        label: platformName,
      };
    }
  }

  // 4. 出力
  console.log(`\n[4/4] ファイル出力中...`);
  const outputPath = writeOutput({ title: sourceData.title, results, videoResult });
  console.log(`  出力先: ${outputPath}`);

  // プレビュー
  if (args.preview) {
    console.log(`  ブラウザプレビューを開きます...`);
    openPreview(outputPath);
  }

  // 標準出力にも結果表示
  console.log("\n" + "=".repeat(60));
  console.log("生成結果");
  console.log("=".repeat(60));

  for (const [platform, result] of Object.entries(results)) {
    console.log(`\n${"─".repeat(40)}`);
    console.log(`[${result.label}]`);
    console.log("─".repeat(40));
    console.log(result.text);
  }

  console.log("\n" + "=".repeat(60));
  console.log("完了！");
  console.log(`出力: ${outputPath}`);
  if (!args.preview) {
    console.log(`プレビュー: node src/index.js --source "${args.source}" --preview`);
  }
}

main().catch((err) => {
  console.error(`\n[FATAL] ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
