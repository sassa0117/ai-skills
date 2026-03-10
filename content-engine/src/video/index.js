import { mkdirSync, existsSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { renderSlides } from "./slide-renderer.js";
import { composeVideo, checkFfmpeg } from "./composer.js";
import { parseSlides } from "../transform/platforms/youtube.js";
import { VIDEO_CONFIG } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");

/** 一時ファイルディレクトリ */
const TEMP_DIR = resolve(rootDir, "temp");

/**
 * YouTube動画パイプライン オーケストレータ
 *
 * フロー: 台本JSON文字列 → パース → スライド画像生成 → 動画合成
 *
 * @param {object} params
 * @param {string} params.scriptText - Claude APIが生成した台本JSON文字列
 * @param {boolean} [params.skipVideo=false] - 動画合成をスキップ（スライド画像のみ生成）
 * @param {object} [params.colorScheme] - カラースキーム上書き
 * @returns {Promise<{script: object, slidePaths: string[], videoPath: string|null}>}
 */
export async function generateVideo({ scriptText, skipVideo = false, colorScheme }) {
  // tempディレクトリを準備（前回の残骸があれば削除）
  if (existsSync(TEMP_DIR)) {
    try {
      rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch {}
  }
  mkdirSync(TEMP_DIR, { recursive: true });

  // 1. 台本パース
  console.log("\n  [動画] 台本をパース中...");
  const script = parseSlides(scriptText);
  console.log(`    タイトル: ${script.title}`);
  console.log(`    スライド数: ${script.slides.length}`);

  // totalDurationを計算
  const totalDuration = script.slides.reduce(
    (sum, s) => sum + (s.duration || VIDEO_CONFIG.defaultSlideDuration),
    0
  );
  console.log(`    合計時間: ${totalDuration}秒`);

  // 2. スライド画像生成
  console.log("\n  [動画] スライド画像を生成中...");
  const { slidePaths, outputDir: slidesDir } = await renderSlides(script, { colorScheme });
  console.log(`    一時出力先: ${slidesDir}`);

  // 3. 動画合成
  let videoPath = null;
  if (!skipVideo) {
    if (!checkFfmpeg()) {
      console.warn("\n  [動画] FFmpegが見つかりません。スライド画像のみ出力します。");
      console.warn("  FFmpegをインストールすれば動画も自動生成されます。");
      console.warn("  → choco install ffmpeg / winget install ffmpeg / scoop install ffmpeg");
    } else {
      console.log("\n  [動画] 動画を合成中...");
      console.log(`    フェードトランジション: ${VIDEO_CONFIG.transitionDuration}秒`);
      videoPath = composeVideo({
        slidePaths,
        slides: script.slides,
      });
      console.log(`    完了: ${videoPath}`);
    }
  } else {
    console.log("\n  [動画] 動画合成スキップ（--skip-video）");
  }

  // 4. 将来対応: 音声合成
  if (VIDEO_CONFIG.audio.enabled && videoPath) {
    console.log("\n  [動画] 音声合成（未実装 - 将来対応）");
    // TODO: ナレーション音声をTTSで生成し、mixAudio()で動画にミックス
  }

  return { script, slidePaths, videoPath };
}
