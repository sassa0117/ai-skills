const fs = require('fs');
const path = require('path');

const credentials = Buffer.from('sassa:NPiF 2vLM Hdl7 w37Z XS5P vgtl').toString('base64');
const baseUrl = 'https://sedorisassa.com/wp-json/wp/v2';

const infographics = [
  { file: '図解_市場構造.png', alt: 'なぜ今アニメグッズで利益が出るのか 市場構造図', insertAfter: 'なぜ今、アニメグッズで利益が出るのか' },
  { file: '図解_5ジャンル比較.png', alt: 'アニメグッズ5ジャンル比較マップ', insertAfter: 'アニメグッズせどりの特徴' },
  { file: '図解_3つの反応ポイント.png', alt: '店舗で反応すべき3つのチェックポイント', insertAfter: '初心者がまず覚えるべき「3つの反応ポイント」' },
  { file: '図解_高騰5条件.png', alt: 'アニメグッズが高騰する5つの条件', insertAfter: '高騰5条件' },
  { file: '図解_仕入れ判断フロー.png', alt: 'ジャンル別仕入れ判断フローチャート', insertAfter: '仕入れ判断フロー' },
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
    headers: {
      'Authorization': 'Basic ' + credentials,
    },
    body: formData
  });

  const data = await res.json();
  if (data.id) {
    console.log('Uploaded:', fileName, '-> ID:', data.id, 'URL:', data.source_url);
    return { id: data.id, url: data.source_url };
  } else {
    console.error('Upload failed:', fileName, JSON.stringify(data).substring(0, 200));
    return null;
  }
}

function createImageBlock(url, alt, width, height) {
  return `<!-- wp:image {"sizeSlug":"full","linkDestination":"none"} -->
<figure class="wp-block-image size-full"><img src="${url}" alt="${alt}" class="wp-image-auto"/></figure>
<!-- /wp:image -->`;
}

async function main() {
  // 1. Upload all images
  const uploaded = [];
  for (const info of infographics) {
    const pngPath = 'C:/Users/user/Desktop/' + info.file;
    const result = await uploadImage(pngPath, info.alt);
    if (result) {
      uploaded.push({ ...info, ...result });
    }
  }

  console.log('\nUploaded', uploaded.length, 'images');

  // 2. Get current post content
  const postRes = await fetch(baseUrl + '/posts/5256?context=edit', {
    headers: { 'Authorization': 'Basic ' + credentials }
  });
  const post = await postRes.json();
  let content = post.content.raw;

  // 3. Insert image blocks after each target heading
  // We insert in reverse order to preserve positions
  const insertions = [];
  for (const item of uploaded) {
    // Find the heading in the content
    const headingIdx = content.indexOf(item.insertAfter);
    if (headingIdx < 0) {
      console.log('Heading not found:', item.insertAfter);
      continue;
    }

    // Find the end of the heading block (after <!-- /wp:sgb/headings -->)
    const afterHeading = content.indexOf('<!-- /wp:sgb/headings -->', headingIdx);
    if (afterHeading < 0) {
      console.log('Heading block end not found for:', item.insertAfter);
      continue;
    }
    const insertPos = afterHeading + '<!-- /wp:sgb/headings -->'.length;

    // Find the next <br> spacer block and insert after it
    const nextBr = content.indexOf('<!-- /wp:paragraph -->', insertPos);
    const finalPos = nextBr > 0 ? nextBr + '<!-- /wp:paragraph -->'.length : insertPos;

    const imageBlock = '\n\n' + createImageBlock(item.url, item.alt) + '\n\n';
    insertions.push({ pos: finalPos, block: imageBlock, name: item.insertAfter });
  }

  // Sort by position descending so insertions don't shift earlier positions
  insertions.sort((a, b) => b.pos - a.pos);

  for (const ins of insertions) {
    content = content.substring(0, ins.pos) + ins.block + content.substring(ins.pos);
    console.log('Inserted image after:', ins.name);
  }

  // 4. Update the post
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
}

main().catch(console.error);
