const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function make(size, outPath) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');

  // 背景: ベージュ
  ctx.fillStyle = '#f7f5f0';
  ctx.fillRect(0, 0, size, size);

  // 角丸風の内側プレート
  const pad = size * 0.08;
  ctx.fillStyle = '#fff';
  roundRect(ctx, pad, pad, size - pad * 2, size - pad * 2, size * 0.14);
  ctx.fill();

  // ラベル（仕入れタグ風）の上部
  const tagW = size * 0.62;
  const tagH = size * 0.34;
  const tagX = (size - tagW) / 2;
  const tagY = size * 0.20;

  // ラベル本体
  ctx.fillStyle = '#c8704b';
  roundRect(ctx, tagX, tagY, tagW, tagH, size * 0.04);
  ctx.fill();

  // 穴
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(tagX + tagW * 0.12, tagY + tagH * 0.25, size * 0.022, 0, Math.PI * 2);
  ctx.fill();

  // ラベル文字「店」
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.floor(size * 0.16)}px "Yu Gothic", "Hiragino Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('店', tagX + tagW * 0.58, tagY + tagH * 0.52);

  // 下部の品物アイコン（箱）
  const boxW = size * 0.5;
  const boxH = size * 0.18;
  const boxX = (size - boxW) / 2;
  const boxY = size * 0.62;
  ctx.fillStyle = '#a85530';
  roundRect(ctx, boxX, boxY, boxW, boxH, size * 0.02);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.floor(size * 0.08)}px "Yu Gothic", sans-serif`;
  ctx.fillText('仕入れラベル', size / 2, boxY + boxH * 0.55);

  fs.writeFileSync(outPath, c.toBuffer('image/png'));
  console.log('wrote', outPath);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

make(192, path.join(__dirname, 'icon-192.png'));
make(512, path.join(__dirname, 'icon-512.png'));
make(180, path.join(__dirname, 'apple-touch-icon.png'));
