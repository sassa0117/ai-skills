/**
 * AI 改修ログ サイト生成スクリプト
 *
 * git log + CHANGELOG.md を読んで sedori-research-app/ai-log.html を生成する。
 * 記録本体は git commit (immutable)。このHTMLは viewer。
 *
 * 運用: AI が commit した後にこのスクリプトを走らせて ai-log.html を更新する。
 * ai-log.html は user が目視確認するための窓口。
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(PROJECT_ROOT, "ai-log.html");
const CHANGELOG_PATH = path.join(PROJECT_ROOT, "CHANGELOG.md");

// 監視対象 (AI が触る運用スクリプト類)
const WATCHED_PATHS = [
  "sedori-research-app/scripts/sample-one-can-badge.mjs",
  "sedori-research-app/scripts/scan-broad-titles.mjs",
  "sedori-research-app/scripts/generate-ai-log.mjs",
  "sedori-research-app/CHANGELOG.md",
];

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf-8", cwd: PROJECT_ROOT }).trim();
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdownLite(md) {
  // 軽量 markdown 変換 (CHANGELOG 用)。完璧な markdown parser ではない。
  const lines = md.split("\n");
  const out = [];
  let inCode = false;
  let inList = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) { out.push("</pre>"); inCode = false; }
      else { out.push("<pre class='code'>"); inCode = true; }
      continue;
    }
    if (inCode) { out.push(escapeHtml(line)); continue; }

    if (line.startsWith("### ")) out.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    else if (line.startsWith("## ")) out.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    else if (line.startsWith("# ")) out.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      const item = line.slice(2).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      out.push(`<li>${item}</li>`);
    }
    else {
      if (inList) { out.push("</ul>"); inList = false; }
      if (line.trim()) {
        const p = line.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        out.push(`<p>${p}</p>`);
      }
    }
  }
  if (inList) out.push("</ul>");
  if (inCode) out.push("</pre>");
  return out.join("\n");
}

// 監視対象パス全部の commit 履歴を取得 (新しい順)
const pathsArg = WATCHED_PATHS.map(p => `"${p}"`).join(" ");
const logRaw = git(`log --pretty=format:%H|%ai|%an|%s -- ${pathsArg}`);
const commits = logRaw ? logRaw.split("\n").map(l => {
  const [hash, date, author, ...subjectParts] = l.split("|");
  return { hash, date, author, subject: subjectParts.join("|") };
}) : [];

// 各 commit の files / diff を取得
for (const c of commits) {
  try {
    c.stat = git(`show --stat --format= ${c.hash} -- ${pathsArg}`);
  } catch { c.stat = ""; }
  try {
    // diff は重いので 200KB 上限 (大きい場合は省略)
    const diff = git(`show --format= ${c.hash} -- ${pathsArg}`);
    c.diff = diff.length > 200_000 ? diff.slice(0, 200_000) + "\n\n... (truncated, " + diff.length + " bytes total)" : diff;
  } catch { c.diff = ""; }
}

// CHANGELOG.md を読み込み
let changelogHtml = "";
if (fs.existsSync(CHANGELOG_PATH)) {
  const md = fs.readFileSync(CHANGELOG_PATH, "utf-8");
  changelogHtml = renderMarkdownLite(md);
} else {
  changelogHtml = "<p><em>CHANGELOG.md 未作成</em></p>";
}

// 現在の working tree status (未commit 変更を検知して警告表示)
let dirtyFiles = [];
try {
  const status = git(`status --porcelain -- ${pathsArg}`);
  if (status) dirtyFiles = status.split("\n").map(l => l.trim()).filter(Boolean);
} catch {}

// HTML 生成
const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>AI 改修ログ — sedori-research-app</title>
<style>
  body { font-family: -apple-system, "Hiragino Sans", "Meiryo", sans-serif; max-width: 1100px; margin: 24px auto; padding: 0 20px; background: #fafafa; color: #222; line-height: 1.65; }
  h1 { font-size: 1.6em; border-bottom: 3px solid #c62828; padding-bottom: 8px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 0.92em; margin: 4px 0 24px; }
  h2 { font-size: 1.3em; margin-top: 36px; padding-bottom: 6px; border-bottom: 2px solid #888; }
  h3 { font-size: 1.05em; margin-top: 20px; color: #444; }
  .alert { background: #fff5e6; border-left: 5px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 4px; }
  .alert-danger { background: #ffe6e6; border-left: 5px solid #c62828; padding: 12px 16px; margin: 16px 0; border-radius: 4px; }
  .commit { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 14px 18px; margin: 14px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
  .commit-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .commit-subject { font-weight: bold; font-size: 1.02em; color: #c62828; }
  .commit-meta { color: #888; font-size: 0.85em; font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
  .commit-stat { background: #f6f8fa; border-radius: 3px; padding: 8px 12px; margin: 8px 0; font-family: ui-monospace, monospace; font-size: 0.82em; white-space: pre-wrap; color: #555; }
  details { margin: 8px 0; }
  summary { cursor: pointer; padding: 6px 10px; background: #f0f0f0; border-radius: 4px; font-size: 0.88em; color: #333; user-select: none; }
  summary:hover { background: #e0e0e0; }
  .diff { background: #fafafa; border: 1px solid #ddd; padding: 12px; font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 0.78em; white-space: pre; overflow-x: auto; max-height: 600px; overflow-y: auto; border-radius: 4px; margin-top: 8px; }
  .diff-add { color: #006400; background: #e6ffea; display: block; }
  .diff-del { color: #8b0000; background: #ffe6e6; display: block; }
  .diff-hunk { color: #6f42c1; display: block; }
  pre.code { background: #f6f8fa; padding: 10px; border-radius: 4px; overflow-x: auto; font-family: ui-monospace, monospace; font-size: 0.85em; }
  code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 0.9em; }
  ul { padding-left: 24px; }
  .watched-list { background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 10px 16px; font-family: ui-monospace, monospace; font-size: 0.85em; }
  .footer { color: #999; font-size: 0.8em; text-align: center; margin: 40px 0 20px; }
</style>
</head>
<body>
<h1>AI 改修ログ — sedori-research-app</h1>
<p class="subtitle">記録本体は git commit (immutable)。このページは viewer。再生成: <code>node scripts/generate-ai-log.mjs</code></p>

${dirtyFiles.length > 0 ? `
<div class="alert-danger">
  <strong>⚠️ 未 commit の変更あり (${dirtyFiles.length}件)</strong><br>
  以下のファイルが working tree で変更されているが git に commit されていない。AI 改修ルールに従い、確認して commit を作成すべき。
  <div class="watched-list" style="margin-top:8px;">${dirtyFiles.map(f => escapeHtml(f)).join("<br>")}</div>
</div>
` : `<div class="alert" style="background:#e8f5e9;border-left-color:#2e7d32;">✓ 監視対象ファイルに未 commit 変更なし</div>`}

<h2>監視対象</h2>
<div class="watched-list">${WATCHED_PATHS.map(p => escapeHtml(p)).join("<br>")}</div>

<h2>CHANGELOG.md (最新版)</h2>
<div>${changelogHtml}</div>

<h2>commit 履歴 (${commits.length}件・新しい順)</h2>
${commits.length === 0 ? "<p><em>該当commit なし</em></p>" : commits.map(c => `
<div class="commit">
  <div class="commit-header">
    <div class="commit-subject">${escapeHtml(c.subject)}</div>
    <div class="commit-meta">${escapeHtml(c.hash.slice(0, 8))} · ${escapeHtml(c.date)} · ${escapeHtml(c.author)}</div>
  </div>
  ${c.stat ? `<div class="commit-stat">${escapeHtml(c.stat)}</div>` : ""}
  ${c.diff ? `<details><summary>差分を表示</summary><div class="diff">${
    c.diff.split("\n").map(line => {
      const esc = escapeHtml(line);
      if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) return esc;
      if (line.startsWith("+")) return `<span class="diff-add">${esc}</span>`;
      if (line.startsWith("-")) return `<span class="diff-del">${esc}</span>`;
      if (line.startsWith("@@")) return `<span class="diff-hunk">${esc}</span>`;
      return esc;
    }).join("\n")
  }</div></details>` : ""}
</div>
`).join("")}

<p class="footer">生成: ${new Date().toLocaleString("ja-JP")} · このページを直接編集しても無意味です (再生成で上書きされます)。記録本体は <code>git log</code> を参照。</p>
</body>
</html>`;

fs.writeFileSync(OUTPUT_PATH, html);
console.log(`✓ AI 改修ログ生成: ${OUTPUT_PATH}`);
console.log(`  commit数: ${commits.length}件`);
console.log(`  未commit変更: ${dirtyFiles.length}件`);
