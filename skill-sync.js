const chokidar = require('chokidar');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const SysTray = require('systray2').default;

// === 設定 ===
const WATCH_DIR = path.join(process.env.USERPROFILE, '.claude', 'commands');
const REPO_DIR = path.join(process.env.USERPROFILE, 'ai-skills');
const DEBOUNCE_MS = 3000;

let watching = true;
let watcher = null;
let debounceTimer = null;
let systray = null;

// === トレイアイコン（1x1 緑/赤 PNG base64） ===
const ICON_ON = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOElEQVQ4T2NkYPj/n4EBDRgZGf8zMDAwMqILoAswMjIyoEtgcQYjuhgug5BdgG4IJhcMWheQHQAAKKgQEQ2XWBQAAAAASUVORK5CYII=';
const ICON_OFF = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANklEQVQ4T2NkYPj/n4EBDRgZGf8zMDAwMqILoAswMjIyoEtgcQYjuhgug5BdgG4IIxZnkB0AAO6NEBFbVBjqAAAAAElFTkSuQmCC';

function log(msg) {
  const time = new Date().toLocaleTimeString('ja-JP');
  console.log(`[${time}] ${msg}`);
}

function gitSync() {
  try {
    // .mdファイルだけコピー
    const files = fs.readdirSync(WATCH_DIR).filter(f => f.endsWith('.md'));
    let copied = 0;
    for (const file of files) {
      const src = path.join(WATCH_DIR, file);
      const dst = path.join(REPO_DIR, file);
      const srcContent = fs.readFileSync(src, 'utf8');
      const dstExists = fs.existsSync(dst);
      const dstContent = dstExists ? fs.readFileSync(dst, 'utf8') : '';
      if (srcContent !== dstContent) {
        fs.copyFileSync(src, dst);
        copied++;
        log(`  コピー: ${file}`);
      }
    }
    if (copied === 0) {
      log('変更なし、スキップ');
      return;
    }

    // git push
    execSync('git add -A', { cwd: REPO_DIR, stdio: 'pipe' });
    const date = new Date().toLocaleString('ja-JP');
    execSync(`git commit -m "auto-sync: ${date}"`, { cwd: REPO_DIR, stdio: 'pipe' });
    execSync('git push', { cwd: REPO_DIR, stdio: 'pipe', timeout: 30000 });
    log(`GitHub同期完了 (${copied}ファイル)`);
  } catch (e) {
    if (e.message && e.message.includes('nothing to commit')) {
      log('コミットなし');
    } else {
      log(`同期エラー: ${e.message}`);
    }
  }
}

function debouncedSync() {
  if (!watching) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    log('変更検出 → 同期開始...');
    gitSync();
  }, DEBOUNCE_MS);
}

function startWatcher() {
  if (watcher) return;
  watcher = chokidar.watch(path.join(WATCH_DIR, '*.md'), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1000 }
  });
  watcher.on('add', f => { log(`新規: ${path.basename(f)}`); debouncedSync(); });
  watcher.on('change', f => { log(`更新: ${path.basename(f)}`); debouncedSync(); });
  watcher.on('unlink', f => { log(`削除: ${path.basename(f)}`); debouncedSync(); });
  log('監視開始: ' + WATCH_DIR);
}

function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
    log('監視停止');
  }
}

function updateTray() {
  if (!systray) return;
  systray.sendAction({
    type: 'update-item',
    item: {
      title: watching ? '● 同期ON' : '○ 同期OFF',
      tooltip: watching ? 'クリックでOFF' : 'クリックでON',
      enabled: true
    },
    seq_id: 0
  });
  systray.sendAction({
    type: 'update-menu',
    menu: {
      icon: watching ? ICON_ON : ICON_OFF,
      title: '',
      tooltip: `Skill Sync - ${watching ? 'ON' : 'OFF'}`
    }
  });
}

// === トレイメニュー ===
systray = new SysTray({
  menu: {
    icon: ICON_ON,
    title: '',
    tooltip: 'Skill Sync - ON',
    items: [
      { title: '● 同期ON', tooltip: 'クリックで切替', enabled: true },
      { title: '今すぐ同期', tooltip: '手動同期', enabled: true },
      { title: '終了', tooltip: 'アプリ終了', enabled: true }
    ]
  },
  debug: false,
  copyDir: false
});

systray.onClick(action => {
  switch (action.seq_id) {
    case 0: // ON/OFFトグル
      watching = !watching;
      if (watching) {
        startWatcher();
      } else {
        stopWatcher();
      }
      updateTray();
      break;
    case 1: // 手動同期
      log('手動同期実行...');
      gitSync();
      break;
    case 2: // 終了
      stopWatcher();
      systray.kill(false);
      process.exit(0);
  }
});

systray.onReady(() => {
  log('=== Skill Sync 起動 ===');
  startWatcher();
  // 起動時に1回同期
  gitSync();
});

systray.onError(err => {
  log(`トレイエラー: ${err.message}`);
});
