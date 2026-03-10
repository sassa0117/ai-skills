/**
 * YouTube動画パイプライン設定
 */

export const VIDEO_CONFIG = {
  width: 1920,
  height: 1080,
  fps: 30,
  transitionDuration: 0.5, // 秒（フェードトランジション）
  defaultSlideDuration: 7, // 秒
  deviceScaleFactor: 2,
  fontLoadWait: 1500, // ms

  colors: {
    // デフォルト（せどり向け）
    default: {
      primary: "#FF6B35",
      secondary: "#D4451A",
      dark: "#8B2500",
      background: "#FFF8F0",
      backgroundEnd: "#FFF0E0",
      text: "#3D2B1F",
      accent: "#FFB347",
      highlight: "#fd79a8",
    },
  },

  channelName: "さっさ",
  siteUrl: "sedorisassa.com",

  // エンコード設定
  encoding: {
    codec: "libx264",
    pixelFormat: "yuv420p",
    preset: "medium",
    crf: 23,
  },

  // 将来対応: 音声合成
  audio: {
    enabled: false, // 将来対応時にtrueに
    provider: null, // "voicevox" | "elevenlabs" | null
    voice: null,
  },
};
