/**
 * ワークフロー統合スクリプト（一括実行）
 *
 * 使い方:
 *   node scripts/publish.js --html article.html --title "記事タイトル" [--images-dir ./infographics] [--eyecatch eyecatch.png] [--status draft]
 *
 * やること（順番に自動実行）:
 *   1. images-dir 内のHTMLファイルをすべてPNG変換
 *   2. 記事HTML内の空のimg srcに、アップロード後の画像URLを差し込み
 *   3. アイキャッチ画像をアップロード
 *   4. 記事をWordPressに投稿（デフォルト: 下書き）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    html: null,
    title: '無題の記事',
    imagesDir: null,
    eyecatch: null,
    status: 'draft'
  };

  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case '--html':
        result.html = args[++i]; break;
      case '--title':
        result.title = args[++i]; break;
      case '--images-dir':
        result.imagesDir = args[++i]; break;
      case '--eyecatch':
        result.eyecatch = args[++i]; break;
      case '--status':
        result.status = args[++i]; break;
      default:
        i++;
    }
    i++;
  }
  return result;
}

function run(cmd) {
  console.log(`  > ${cmd}`);
  try {
    const output = execSync(cmd, { encoding: 'utf-8', cwd: path.join(__dirname, '..') });
    if (output.trim()) console.log(output);
    return output;
  } catch (e) {
    console.error(`コマンド失敗: ${e.message}`);
    return null;
  }
}

async function main() {
  const args = parseArgs();

  if (!args.html) {
    console.log('ブログ記事 一括公開ワークフロー');
    console.log('================================\n');
    console.log('使い方:');
    console.log('  node scripts/publish.js --html <記事HTML> --title "タイトル" [オプション]\n');
    console.log('オプション:');
    console.log('  --html <パス>          記事のHTMLファイル（必須）');
    console.log('  --title "タイトル"     記事タイトル（必須）');
    console.log('  --images-dir <パス>    図解HTMLファイルが入ったフォルダ（PNG変換される）');
    console.log('  --eyecatch <パス>      アイキャッチ画像（PNG/JPG）');
    console.log('  --status draft|publish 公開状態（デフォルト: draft）');
    console.log('\n例:');
    console.log('  node scripts/publish.js --html article.html --title "攻略法3選" --images-dir ./infographics --eyecatch eyecatch.png');
    process.exit(0);
  }

  console.log('========================================');
  console.log('  ブログ記事 一括公開ワークフロー');
  console.log('========================================\n');

  const imageFiles = [];

  // STEP 1: 図解HTMLをPNGに変換
  if (args.imagesDir) {
    console.log('STEP 1: 図解HTML → PNG変換');
    console.log('─────────────────────────────');
    const dir = path.resolve(args.imagesDir);
    if (fs.existsSync(dir)) {
      run(`node scripts/screenshot.js "${dir}"`);
      // 変換後のPNGを収集
      const outputDir = path.join(__dirname, '..', 'output');
      if (fs.existsSync(outputDir)) {
        const pngs = fs.readdirSync(outputDir).filter(f => f.endsWith('.png'));
        for (const png of pngs) {
          imageFiles.push(path.join(outputDir, png));
        }
      }
    } else {
      console.log(`  スキップ: ${dir} が存在しません`);
    }
    console.log('');
  } else {
    console.log('STEP 1: スキップ（--images-dir 未指定）\n');
  }

  // STEP 2: WordPress に投稿
  console.log('STEP 2: WordPress に投稿');
  console.log('─────────────────────────────');

  let wpCmd = `node scripts/wp-post.js "${path.resolve(args.html)}" --title "${args.title}" --status ${args.status}`;

  // アイキャッチ画像
  if (args.eyecatch) {
    wpCmd += ` --image "${path.resolve(args.eyecatch)}"`;
  }

  // 図解画像
  for (const img of imageFiles) {
    wpCmd += ` --image "${img}"`;
  }

  run(wpCmd);

  console.log('\n========================================');
  console.log('  ワークフロー完了!');
  console.log('========================================');
  console.log(`\n次のステップ:`);
  console.log(`  1. WordPress管理画面で記事を確認`);
  console.log(`  2. アップロードされた画像を記事内の正しい位置に配置`);
  console.log(`  3. プレビューで確認後、公開`);
}

main();
