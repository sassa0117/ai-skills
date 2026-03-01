export const SEDORI_RESEARCH_SYSTEM_PROMPT = `あなたは電脳せどりのリサーチ専門AIです。
以下のフレームワークに基づいて、商品の仕入れ判断を行ってください。

## 判断フレームワーク（さっさ式暗黙知）

### 1. 相場の読み方
- メルカリのsold価格が最も信頼できる実勢価格
- ヤフオクの落札価格はオークション形式のため実勢に近い
- 駿河屋の買取価格×3が推定売価の目安
- 複数サイトのデータを総合して中央値を重視する

### 2. 販売履歴がない場合の値付け判断

#### 2-1. いいね数による需要判定
- いいねが多い出品中商品 → 需要は存在する
- 購入に至っていない理由（状態・価格）を推測する

#### 2-2. 代替不可能性スコア
「この商品にしかない要素」の強さ。高いほど値崩れしにくい。
- 場所限定（原画展限定、ショップ限定、現地限定等）
- 数量限定（シリアルナンバー付き、限定○個等）
- イベント限定（世界大会限定衣装、イベント限定デザイン等）
- 唯一のデザイン（そのデザインでしか存在しない）
- マイナー商品のグッズ（そのキャラ/IPのグッズ自体が少ない）
- 廃盤品で代替商品なし

#### 2-3. 類似商品からの相場推定
- 同シリーズ別年代の価格を参考にする
- デザイン差・生産数で前後する

#### 2-4. 比較優位性（消費者の比較購買行動）
- 上位互換品の相場が上がれば下位商品も追従する
- 例：スケールフィギュア↑ → プライズフィギュアも↑

### 3. 市場在庫と独占状態
- 市場在庫が枯れている（出品が極少数）＝ 実質独占販売状態
- この状態なら過去の最終履歴より上振れが見込める

### 4. リスク考慮
- 再販リスク：過去に高値 → 再販で相場下落のケース
- AIが見落としやすい差分：リメイク版vsオリジナル、二次抽選品（不具合修正済み）等

## 出力フォーマット

以下の形式で出力してください：

### 商品分析
[商品の特性、限定性、代替不可能性などの分析]

### 相場判断
[収集データに基づく相場の読み]

### 仕入れ推奨度
**推奨度: [強気 / 標準 / 慎重 / 見送り]**

### 推定利益
- 推定売価: ¥○○○
- 仕入れ値: ¥○○○
- 手数料(10%): ¥○○○
- 送料(推定): ¥○○○
- 推定利益: ¥○○○
- ROI: ○○%

### リスク・注意点
[再販リスク、状態による価格差、見落としポイント等]
`;

export function buildResearchPrompt(
  keyword: string,
  purchasePrice: number | undefined,
  scrapedData: {
    mercari: { name: string; price: number; date?: string }[];
    yahooAuction: { name: string; price: number; date?: string; bids?: number }[];
    surugaya: { name: string; price: number }[];
    mandarake: { name: string; price: number }[];
    lashinbang: { name: string; price: number }[];
  }
): string {
  const sections: string[] = [];

  sections.push(`## リサーチ対象\nキーワード: 「${keyword}」`);

  if (purchasePrice !== undefined) {
    sections.push(`仕入れ値: ¥${purchasePrice.toLocaleString()}`);
  }

  // メルカリsold
  if (scrapedData.mercari.length > 0) {
    const prices = scrapedData.mercari.map((i) => i.price);
    sections.push(
      `## メルカリ sold（${scrapedData.mercari.length}件）\n` +
        scrapedData.mercari
          .slice(0, 20)
          .map((i) => `- ¥${i.price.toLocaleString()} | ${i.name}${i.date ? ` | ${i.date}` : ""}`)
          .join("\n") +
        `\n平均: ¥${Math.round(prices.reduce((a, b) => a + b, 0) / prices.length).toLocaleString()} / 中央値: ¥${prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)].toLocaleString()}`
    );
  } else {
    sections.push("## メルカリ sold\nデータなし");
  }

  // ヤフオク落札
  if (scrapedData.yahooAuction.length > 0) {
    const prices = scrapedData.yahooAuction.map((i) => i.price);
    sections.push(
      `## ヤフオク落札（${scrapedData.yahooAuction.length}件）\n` +
        scrapedData.yahooAuction
          .slice(0, 20)
          .map(
            (i) =>
              `- ¥${i.price.toLocaleString()} | ${i.name}${i.bids ? ` | ${i.bids}件入札` : ""}${i.date ? ` | ${i.date}` : ""}`
          )
          .join("\n") +
        `\n平均: ¥${Math.round(prices.reduce((a, b) => a + b, 0) / prices.length).toLocaleString()} / 中央値: ¥${prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)].toLocaleString()}`
    );
  } else {
    sections.push("## ヤフオク落札\nデータなし");
  }

  // 駿河屋
  if (scrapedData.surugaya.length > 0) {
    sections.push(
      `## 駿河屋（${scrapedData.surugaya.length}件）\n` +
        scrapedData.surugaya
          .slice(0, 10)
          .map((i) => `- ¥${i.price.toLocaleString()} | ${i.name}`)
          .join("\n")
    );
  }

  // まんだらけ
  if (scrapedData.mandarake.length > 0) {
    sections.push(
      `## まんだらけ（${scrapedData.mandarake.length}件）\n` +
        scrapedData.mandarake
          .slice(0, 10)
          .map((i) => `- ¥${i.price.toLocaleString()} | ${i.name}`)
          .join("\n")
    );
  }

  // らしんばん
  if (scrapedData.lashinbang.length > 0) {
    sections.push(
      `## らしんばん（${scrapedData.lashinbang.length}件）\n` +
        scrapedData.lashinbang
          .slice(0, 10)
          .map((i) => `- ¥${i.price.toLocaleString()} | ${i.name}`)
          .join("\n")
    );
  }

  sections.push(
    "\n上記のデータに基づいて、フレームワークに従ってリサーチ結果を出力してください。"
  );

  return sections.join("\n\n");
}
