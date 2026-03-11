const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const credentials = Buffer.from('sassa:NPiF 2vLM Hdl7 w37Z XS5P vgtl').toString('base64');
const baseUrl = 'https://sedorisassa.com/wp-json/wp/v2';

const infographics = [
  { file: '図解_条件1_年式', alt: '条件1 年式10年前後 リバイバル需要で高騰するメカニズム', insertAfter: '条件1：年式10年前後（リバイバル需要）' },
  { file: '図解_条件2_周年', alt: '条件2 周年商品の1〜2年後 供給停止でプレミア化', insertAfter: '条件2：周年商品の1〜2年後（供給停止）' },
  { file: '図解_条件3_限定品', alt: '条件3 イベント限定・廃盤・再販停止', insertAfter: '条件3：イベント限定・廃盤・再販停止' },
  { file: '図解_条件4_代替不可能', alt: '条件4 代替不可能性 唯一のビジュアルに需要が集中', insertAfter: '条件4：代替不可能性（唯一のビジュアル）' },
  { file: '図解_条件5_在庫枯渇', alt: '条件5 市場在庫枯渇 出品数が少ないと強気の値付け', insertAfter: '条件5：市場在庫枯渇' },
];

async function uploadImage(filePath, altText) {
  const fileData = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const formData = new FormData();
  formData.append('file', new Blob([fileData], { type: 'image/png' }), fileName);
  formData.append('alt_text', altText);
  formData.append('title', altText);
  const res = await fetch(baseUrl + '/media', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + credentials },
    body: formData
  });
  const data = await res.json();
  if (data.id) {
    console.log('Uploaded:', fileName, '-> ID:', data.id);
    return { id: data.id, url: data.source_url };
  }
  console.error('Upload failed:', fileName);
  return null;
}

(async () => {
  // 1. Convert HTML to PNG
  const browser = await puppeteer.launch({ headless: 'new' });
  for (const info of infographics) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const htmlPath = path.resolve('C:/Users/user/Desktop/' + info.file + '.html');
    const fileUrl = 'file:///' + htmlPath.split('\\').join('/');
    await page.goto(fileUrl);
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: 'C:/Users/user/Desktop/' + info.file + '.png', type: 'png' });
    console.log('PNG:', info.file + '.png');
    await page.close();
  }
  await browser.close();

  // 2. Upload to WP
  const uploaded = [];
  for (const info of infographics) {
    const pngPath = 'C:/Users/user/Desktop/' + info.file + '.png';
    const result = await uploadImage(pngPath, info.alt);
    if (result) uploaded.push({ ...info, ...result });
  }
  console.log('\nUploaded', uploaded.length, 'images');

  // 3. Get current post content
  const postRes = await fetch(baseUrl + '/posts/5256?context=edit', {
    headers: { 'Authorization': 'Basic ' + credentials }
  });
  const post = await postRes.json();
  let content = post.content.raw;

  // 4. Insert images after each condition heading
  const insertions = [];
  for (const item of uploaded) {
    const headingIdx = content.indexOf(item.insertAfter);
    if (headingIdx < 0) {
      console.log('NOT FOUND:', item.insertAfter);
      continue;
    }
    const afterHeading = content.indexOf('<!-- /wp:sgb/headings -->', headingIdx);
    if (afterHeading < 0) continue;
    const insertPos = afterHeading + '<!-- /wp:sgb/headings -->'.length;
    // Find next spacer paragraph
    const nextBr = content.indexOf('<!-- /wp:paragraph -->', insertPos);
    const finalPos = nextBr > 0 && nextBr - insertPos < 200 ? nextBr + '<!-- /wp:paragraph -->'.length : insertPos;

    const imageBlock = '\n\n<!-- wp:image {"sizeSlug":"full","linkDestination":"none"} -->\n<figure class="wp-block-image size-full"><img src="' + item.url + '" alt="' + item.alt + '" class="wp-image-' + item.id + '"/></figure>\n<!-- /wp:image -->\n\n';
    insertions.push({ pos: finalPos, block: imageBlock, name: item.insertAfter });
  }

  insertions.sort((a, b) => b.pos - a.pos);
  for (const ins of insertions) {
    content = content.substring(0, ins.pos) + ins.block + content.substring(ins.pos);
    console.log('Inserted after:', ins.name);
  }

  // 5. Update post
  const updateRes = await fetch(baseUrl + '/posts/5256', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + credentials
    },
    body: JSON.stringify({ content })
  });
  const updated = await updateRes.json();
  console.log('\nPost updated:', updated.id ? 'SUCCESS' : 'FAILED');
  console.log('Preview: https://sedorisassa.com/?p=5256&preview=true');
})();
