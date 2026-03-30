/**
 * 駿河屋 買取リスト ビューア
 *
 * 使い方: node scripts/kaitori-viewer.mjs
 * ブラウザで http://localhost:3002 を開く
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 3002;

// 進捗ファイルを全カテゴリ分読み込む
function loadAllProgress() {
  const files = fs.readdirSync(ROOT).filter(f => f.match(/^kaitori_\d+_progress\.json$/));
  const all = {};
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf-8'));
    const catId = data.categoryId || f.match(/kaitori_(\d+)_progress/)?.[1];
    all[catId] = data;
  }
  return all;
}

// スクレイパープロセス管理
let scraperProcess = null;
let scraperLog = [];

function startScraper(categoryId, targetCount) {
  if (scraperProcess) return { error: '既に実行中' };
  scraperLog = [];
  scraperProcess = spawn('node', [path.join(ROOT, 'scripts/surugaya-kaitori-list.mjs'), categoryId, String(targetCount)], {
    cwd: ROOT,
  });
  scraperProcess.stdout.on('data', d => scraperLog.push(d.toString()));
  scraperProcess.stderr.on('data', d => scraperLog.push('[ERR] ' + d.toString()));
  scraperProcess.on('close', () => { scraperProcess = null; });
  return { ok: true };
}

function stopScraper() {
  if (!scraperProcess) return { error: '実行中のプロセスなし' };
  scraperProcess.kill();
  scraperProcess = null;
  return { ok: true };
}

const CATEGORIES = {
  '500': 'おもちゃ',
  '501': 'ホビー',
  '10': 'グッズ・ファッション',
  '200': 'ゲーム TVゲーム',
  '300': '映像ソフト アニメ',
  '700': '書籍・コミック',
};

function renderPage() {
  const allData = loadAllProgress();

  // 全カテゴリの品切れアイテムを統合
  let allItems = [];
  for (const [catId, data] of Object.entries(allData)) {
    if (data.items) {
      allItems.push(...data.items.map(item => ({ ...item, category: CATEGORIES[catId] || catId })));
    }
  }
  // 買取価格降順
  allItems.sort((a, b) => (b.kaitoriPrice || 0) - (a.kaitoriPrice || 0));

  const rows = allItems.map((r, i) => {
    const url = `https://www.suruga-ya.jp/product/detail/${r.productId}`;
    return `<tr>
      <td>${i + 1}</td>
      <td>${r.category || '-'}</td>
      <td>${r.productId}</td>
      <td title="${(r.name || '').replace(/"/g, '&quot;')}">${(r.name || '').replace(/</g, '&lt;')}</td>
      <td class="price">${r.kaitoriPrice ? r.kaitoriPrice.toLocaleString() : '-'}</td>
      <td><a href="${url}" target="_blank">駿河屋</a></td>
    </tr>`;
  }).join('\n');

  const catOptions = Object.entries(CATEGORIES).map(([id, name]) =>
    `<option value="${id}">${name} (${id})</option>`
  ).join('');

  const statsHtml = Object.entries(allData).map(([catId, data]) =>
    `<span class="stat">${CATEGORIES[catId] || catId}: ${data.items?.length || 0}件 (${data.knownIds?.length || 0}チェック済)</span>`
  ).join('');

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<title>駿河屋 買取リスト</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', sans-serif; background: #f8f9fa; color: #333; padding: 20px; }
h1 { font-size: 1.4em; margin-bottom: 12px; }
.controls { background: #fff; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.controls select, .controls input, .controls button { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
.controls button { background: #0066cc; color: #fff; border: none; cursor: pointer; }
.controls button:hover { background: #0052a3; }
.controls button.stop { background: #cc3333; }
.stats { margin-bottom: 12px; display: flex; gap: 16px; flex-wrap: wrap; }
.stat { background: #e8f4f8; padding: 6px 12px; border-radius: 4px; font-size: 13px; }
.total { font-size: 15px; font-weight: bold; margin-bottom: 12px; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
th { background: #f0f0f0; padding: 10px 12px; text-align: left; font-size: 13px; position: sticky; top: 0; cursor: pointer; }
th:hover { background: #e0e0e0; }
td { padding: 8px 12px; border-top: 1px solid #eee; font-size: 13px; }
tr:hover { background: #fffbe6; }
.price { text-align: right; font-weight: bold; }
a { color: #0066cc; text-decoration: none; }
a:hover { text-decoration: underline; }
#log { background: #1e1e1e; color: #0f0; font-family: monospace; font-size: 12px; padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto; margin-top: 12px; display: none; white-space: pre-wrap; }
#filter { margin-left: auto; }
</style>
</head><body>
<h1>駿河屋 買取リスト - 品切れ希少商品</h1>
<div class="controls">
  <select id="category">${catOptions}</select>
  <input type="number" id="target" value="50" min="1" max="10000" style="width:80px" placeholder="件数">
  <button onclick="startScrape()">取得開始</button>
  <button class="stop" onclick="stopScrape()">停止</button>
  <button onclick="location.reload()" style="background:#666">更新</button>
  <input type="text" id="filter" placeholder="検索..." oninput="filterTable()" style="width:200px">
</div>
<div class="stats">${statsHtml}</div>
<div class="total">合計: ${allItems.length}件</div>
<table id="items">
<thead><tr><th>#</th><th>カテゴリ</th><th>商品ID</th><th>商品名</th><th>買取価格</th><th>リンク</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<div id="log"></div>
<script>
async function startScrape() {
  const cat = document.getElementById('category').value;
  const target = document.getElementById('target').value;
  const res = await fetch('/api/start?category=' + cat + '&target=' + target);
  const data = await res.json();
  if (data.error) { alert(data.error); return; }
  document.getElementById('log').style.display = 'block';
  pollLog();
}
async function stopScrape() {
  await fetch('/api/stop');
  document.getElementById('log').style.display = 'none';
}
async function pollLog() {
  const res = await fetch('/api/log');
  const data = await res.json();
  document.getElementById('log').textContent = data.log;
  document.getElementById('log').scrollTop = 99999;
  if (data.running) setTimeout(pollLog, 2000);
  else { setTimeout(() => location.reload(), 1000); }
}
function filterTable() {
  const q = document.getElementById('filter').value.toLowerCase();
  document.querySelectorAll('#items tbody tr').forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
</script>
</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/start') {
    const cat = url.searchParams.get('category') || '500';
    const target = url.searchParams.get('target') || '50';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(startScraper(cat, target)));
  } else if (url.pathname === '/api/stop') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stopScraper()));
  } else if (url.pathname === '/api/log') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ log: scraperLog.join(''), running: !!scraperProcess }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderPage());
  }
});

server.listen(PORT, () => {
  console.log(`\n買取リストビューア起動: http://localhost:${PORT}\n`);
});
