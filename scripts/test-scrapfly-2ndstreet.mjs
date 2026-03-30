// Scrapfly経由でセカストオンラインにアクセスできるかテスト
const API_KEY = 'scp-live-204d6f76815a493fbd309b9466ce4f35';
const TARGET_URL = 'https://www.2ndstreet.jp/search?category=130001&sortBy=arrival';

async function test() {
  const params = new URLSearchParams({
    key: API_KEY,
    url: TARGET_URL,
    asp: 'true',        // Anti Scraping Protection（Cloudflare突破）
    render_js: 'true',  // JavaScript実行
    country: 'jp',      // 日本からアクセス
  });

  const apiUrl = `https://api.scrapfly.io/scrape?${params}`;

  console.log('セカストオンラインにScrapfly経由でアクセス中...');
  console.log(`URL: ${TARGET_URL}`);
  console.log('');

  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(120000), // 2分タイムアウト
    });

    if (!res.ok) {
      const rejectCode = res.headers.get('X-Scrapfly-Reject-Code');
      console.error(`❌ HTTPエラー: ${res.status}`);
      if (rejectCode) console.error(`Reject Code: ${rejectCode}`);
      const body = await res.text();
      console.error(body.slice(0, 500));
      return;
    }

    const data = await res.json();
    const result = data.result;

    console.log('✅ アクセス成功！');
    console.log(`ステータスコード: ${result.status_code}`);
    console.log(`コンテンツサイズ: ${result.content.length} 文字`);
    console.log(`使用クレジット: ${data.config?.cost || 'N/A'}`);
    console.log('');

    // 商品情報が取れてるか確認
    const html = result.content;

    // 商品数
    const countMatch = html.match(/検索結果\s*[：:]\s*([\d,]+)\s*点/);
    if (countMatch) {
      console.log(`検索結果: ${countMatch[1]}点`);
    }

    // 商品カードのパターンを探す
    // スクショから: ブランド名、カテゴリ、価格が見える
    const priceMatches = html.match(/¥[\d,]+/g);
    if (priceMatches) {
      console.log(`価格表示の数: ${priceMatches.length}件`);
      console.log(`価格サンプル: ${priceMatches.slice(0, 5).join(', ')}`);
    }

    // HTMLの一部を出力して構造を確認
    console.log('\n--- HTML構造サンプル（商品部分を探す）---');

    // 商品リスト周辺を探す
    const productArea = html.indexOf('商品の状態');
    if (productArea > -1) {
      console.log(html.slice(Math.max(0, productArea - 500), productArea + 500));
    } else {
      // 別のパターンで探す
      const itemArea = html.indexOf('¥');
      if (itemArea > -1) {
        console.log(html.slice(Math.max(0, itemArea - 300), itemArea + 300));
      } else {
        console.log('商品データが見つからない。HTML先頭500文字:');
        console.log(html.slice(0, 500));
      }
    }

  } catch (err) {
    console.error(`❌ エラー: ${err.message}`);
  }
}

test();
