const chokidar = require('chokidar');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WATCH_DIR = path.join(process.env.USERPROFILE, '.claude', 'commands');
const REPO_DIR = path.join(process.env.USERPROFILE, 'ai-skills');
const DEBOUNCE_MS = 3000;

let debounceTimer = null;

function log(msg) {
  const time = new Date().toLocaleTimeString('ja-JP');
  console.log(`[${time}] ${msg}`);
}

function gitSync() {
  try {
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
      log('変更なし');
      return;
    }
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
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    log('変更検出 → 同期開始...');
    gitSync();
  }, DEBOUNCE_MS);
}

const watcher = chokidar.watch(path.join(WATCH_DIR, '*.md'), {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 1000 }
});

watcher.on('add', f => { log(`新規: ${path.basename(f)}`); debouncedSync(); });
watcher.on('change', f => { log(`更新: ${path.basename(f)}`); debouncedSync(); });
watcher.on('unlink', f => { log(`削除: ${path.basename(f)}`); debouncedSync(); });

log('=== Skill Watcher 起動 ===');
log('監視: ' + WATCH_DIR);
gitSync();

process.on('SIGTERM', () => { watcher.close(); process.exit(0); });
process.on('SIGINT', () => { watcher.close(); process.exit(0); });
