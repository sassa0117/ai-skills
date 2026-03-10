import { execSync, execFileSync } from "child_process";
import { writeFileSync, existsSync, unlinkSync, statSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { VIDEO_CONFIG } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");

/** 一時ファイルディレクトリ */
const TEMP_DIR = resolve(rootDir, "temp");

/** 動画出力ディレクトリ */
const VIDEO_TEMP_DIR = resolve(TEMP_DIR, "video");

/**
 * FFmpegがPATHに存在するかチェック
 * @returns {boolean}
 */
export function checkFfmpeg() {
  try {
    execSync("where ffmpeg", { stdio: "pipe", shell: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * 連番PNGとduration情報からMP4動画を合成する
 *
 * 各スライドに個別のdurationを設定し、スライド間にフェードトランジションを適用する。
 *
 * @param {object} params
 * @param {string[]} params.slidePaths - スライドPNGファイルのパス配列
 * @param {object[]} params.slides - 台本のslides配列（duration情報）
 * @param {string} [params.outputPath] - 出力mp4パス
 * @returns {string} 出力mp4パス
 */
export function composeVideo({ slidePaths, slides, outputPath }) {
  if (!checkFfmpeg()) {
    console.error(`
[ERROR] FFmpegが見つかりません。

インストール方法:
  choco install ffmpeg    (Chocolatey)
  winget install ffmpeg   (winget)
  scoop install ffmpeg    (Scoop)

インストール後、ターミナルを再起動してください。
`);
    throw new Error("FFmpegがPATHにありません。上記の方法でインストールしてください。");
  }

  mkdirSync(VIDEO_TEMP_DIR, { recursive: true });

  const output = outputPath || resolve(VIDEO_TEMP_DIR, "output.mp4");
  const { transitionDuration, defaultSlideDuration, fps } = VIDEO_CONFIG;
  const { codec, pixelFormat, preset, crf } = VIDEO_CONFIG.encoding;

  // フェードトランジション付きの場合はfilter_complexを使う
  if (transitionDuration > 0 && slidePaths.length > 1) {
    return composeWithTransitions({
      slidePaths,
      slides,
      output,
      transitionDuration,
      defaultSlideDuration,
      fps,
      codec,
      pixelFormat,
      preset,
      crf,
    });
  }

  // フェードなし: シンプルなconcat demuxer
  return composeSimple({
    slidePaths,
    slides,
    output,
    defaultSlideDuration,
    codec,
    pixelFormat,
    preset,
    crf,
  });
}

/**
 * フェードトランジション付きで動画を合成
 */
function composeWithTransitions({
  slidePaths,
  slides,
  output,
  transitionDuration,
  defaultSlideDuration,
  fps,
  codec,
  pixelFormat,
  preset,
  crf,
}) {
  const { width, height } = VIDEO_CONFIG;
  const n = slidePaths.length;

  // 各スライドのduration取得
  const durations = slidePaths.map((_, i) => slides[i]?.duration || defaultSlideDuration);

  // 入力ファイル引数
  const inputArgs = [];
  for (const p of slidePaths) {
    inputArgs.push("-loop", "1", "-t", String(durations[slidePaths.indexOf(p)]), "-i", p.replace(/\\/g, "/"));
  }

  // filter_complex構築
  // 各入力をスケーリング+fps設定
  let filterParts = [];
  for (let i = 0; i < n; i++) {
    filterParts.push(`[${i}:v]scale=${width}:${height},setsar=1,fps=${fps},format=${pixelFormat}[v${i}];`);
  }

  // xfadeで連結
  if (n === 1) {
    // 1枚だけの場合
    const ffmpegArgs = [
      "-y",
      "-loop", "1",
      "-t", String(durations[0]),
      "-i", slidePaths[0].replace(/\\/g, "/"),
      "-vf", `scale=${width}:${height},fps=${fps},format=${pixelFormat}`,
      "-c:v", codec,
      "-pix_fmt", pixelFormat,
      "-preset", preset,
      "-crf", String(crf),
      "-movflags", "+faststart",
      output,
    ];

    execFFmpeg(ffmpegArgs);
    return output;
  }

  // xfadeチェーン: [v0][v1]xfade -> [xf0]; [xf0][v2]xfade -> [xf1]; ...
  let prevLabel = "v0";
  for (let i = 1; i < n; i++) {
    // offsetは前のスライドのduration - transitionDuration の累積
    let offset = 0;
    for (let j = 0; j < i; j++) {
      offset += durations[j] - (j < i - 1 ? transitionDuration : 0);
    }
    offset -= transitionDuration;
    if (offset < 0) offset = 0;

    const outLabel = i < n - 1 ? `xf${i - 1}` : `outv`;
    filterParts.push(
      `[${prevLabel}][v${i}]xfade=transition=fade:duration=${transitionDuration}:offset=${offset.toFixed(2)}[${outLabel}];`
    );
    prevLabel = outLabel;
  }

  // 最後のセミコロンを除去
  let filterComplex = filterParts.join("\n");
  if (filterComplex.endsWith(";")) {
    filterComplex = filterComplex.slice(0, -1);
  }

  // filter_complexファイルに書き出し（長すぎるとコマンドラインに収まらない）
  const filterPath = resolve(VIDEO_TEMP_DIR, "_filter_complex.txt");
  writeFileSync(filterPath, filterComplex, "utf-8");

  const ffmpegArgs = [
    "-y",
    ...inputArgs,
    "-filter_complex_script", filterPath,
    "-map", "[outv]",
    "-c:v", codec,
    "-pix_fmt", pixelFormat,
    "-preset", preset,
    "-crf", String(crf),
    "-movflags", "+faststart",
    output,
  ];

  execFFmpeg(ffmpegArgs);

  // 一時ファイル削除
  try { unlinkSync(filterPath); } catch {}

  return output;
}

/**
 * シンプルなconcat demuxerで動画を合成（フェードなし）
 */
function composeSimple({
  slidePaths,
  slides,
  output,
  defaultSlideDuration,
  codec,
  pixelFormat,
  preset,
  crf,
}) {
  const { width, height } = VIDEO_CONFIG;

  // concat demuxer用のファイルリストを生成
  const concatLines = slidePaths.map((p, i) => {
    const duration = slides[i]?.duration || defaultSlideDuration;
    const filePath = p.replace(/\\/g, "/");
    return `file '${filePath}'\nduration ${duration}`;
  });
  // 最後のスライドは再度指定（FFmpeg concat demuxerの仕様）
  if (slidePaths.length > 0) {
    const lastPath = slidePaths[slidePaths.length - 1].replace(/\\/g, "/");
    concatLines.push(`file '${lastPath}'`);
  }

  const concatFilePath = resolve(VIDEO_TEMP_DIR, "_concat_list.txt");
  writeFileSync(concatFilePath, concatLines.join("\n"), "utf-8");

  const ffmpegArgs = [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatFilePath,
    "-vf", `scale=${width}:${height}`,
    "-c:v", codec,
    "-pix_fmt", pixelFormat,
    "-preset", preset,
    "-crf", String(crf),
    "-movflags", "+faststart",
    output,
  ];

  execFFmpeg(ffmpegArgs);

  // 一時ファイル削除
  try { unlinkSync(concatFilePath); } catch {}

  return output;
}

/**
 * FFmpegを実行する共通関数
 */
function execFFmpeg(args) {
  console.log(`    FFmpeg実行中...`);

  try {
    execFileSync("ffmpeg", args, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300000, // 5分タイムアウト
    });
  } catch (err) {
    const stderr = err.stderr?.toString() || "";
    throw new Error(`FFmpegでエラーが発生しました:\n${stderr.slice(-500)}`);
  }

  // ファイルサイズ確認
  const output = args[args.length - 1];
  if (existsSync(output)) {
    const size = statSync(output).size;
    const sizeMB = (size / 1024 / 1024).toFixed(1);
    console.log(`    動画サイズ: ${sizeMB} MB`);
  }
}

/**
 * 将来対応: 音声ファイルを動画にミックスする
 * @param {string} videoPath - 動画ファイルパス
 * @param {string} audioPath - 音声ファイルパス
 * @param {string} outputPath - 出力ファイルパス
 * @returns {string} 出力mp4パス
 */
export function mixAudio(videoPath, audioPath, outputPath) {
  // プレースホルダー: 音声合成が実装されたら使う
  if (!VIDEO_CONFIG.audio.enabled) {
    console.warn("    [音声] 音声合成は未対応です（将来実装予定）");
    return videoPath;
  }

  const ffmpegArgs = [
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    outputPath,
  ];

  execFFmpeg(ffmpegArgs);
  return outputPath;
}
