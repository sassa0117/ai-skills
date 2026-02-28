import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const prisma = new PrismaClient();

const CSV_PATH = "C:/Users/user/Downloads/furikan_cleaned.csv";

// フリカン → アプリのステータスマッピング
const STATUS_MAP: Record<string, string> = {
  取引完了: "completed",
  出品中: "listing",
  出品前: "before_listing",
  発送待ち: "shipped",
};

function parseCSV(text: string) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = vals[idx] || ""));
    rows.push(obj);
  }
  return rows;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(/\//g, "-"));
  return isNaN(d.getTime()) ? null : d;
}

function parseFloat0(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

async function getOrCreate<T extends { id: string }>(
  model: { findFirst: Function; create: Function },
  name: string
): Promise<string | null> {
  if (!name) return null;
  const existing = await model.findFirst({ where: { name } });
  if (existing) return (existing as T).id;
  const created = await model.create({ data: { name } });
  return (created as T).id;
}

async function main() {
  const text = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(text);
  console.log(`CSV読み込み: ${rows.length}件`);

  // 既存のサンプルデータを削除
  console.log("既存データを削除中...");
  await prisma.productTag.deleteMany();
  await prisma.product.deleteMany();
  await prisma.platform.deleteMany();
  await prisma.category.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.tag.deleteMany();

  // デフォルトのプラットフォーム作成
  const platformCache = new Map<string, string>();
  for (const p of [
    { name: "メルカリ", rate: 10.0 },
    { name: "ヤフオク", rate: 10.0 },
    { name: "ラクマ", rate: 6.0 },
    { name: "Amazon", rate: 15.0 },
  ]) {
    const created = await prisma.platform.create({
      data: { name: p.name, commissionRate: p.rate },
    });
    platformCache.set(p.name, created.id);
  }

  // キャッシュ
  const categoryCache = new Map<string, string>();
  const supplierCache = new Map<string, string>();
  const paymentCache = new Map<string, string>();
  const tagCache = new Map<string, string>();

  // デフォルトタグ
  for (const t of ["新品", "中古", "レア", "セール品", "電脳"]) {
    const created = await prisma.tag.create({ data: { name: t } });
    tagCache.set(t, created.id);
  }

  async function getPlatformId(name: string): Promise<string | null> {
    if (!name) return null;
    if (platformCache.has(name)) return platformCache.get(name)!;
    const created = await prisma.platform.create({
      data: { name, commissionRate: 10.0 },
    });
    platformCache.set(name, created.id);
    return created.id;
  }

  async function getCategoryId(name: string): Promise<string | null> {
    if (!name) return null;
    if (categoryCache.has(name)) return categoryCache.get(name)!;
    const created = await prisma.category.create({ data: { name } });
    categoryCache.set(name, created.id);
    return created.id;
  }

  async function getSupplierId(name: string): Promise<string | null> {
    if (!name) return null;
    if (supplierCache.has(name)) return supplierCache.get(name)!;
    const created = await prisma.supplier.create({ data: { name } });
    supplierCache.set(name, created.id);
    return created.id;
  }

  async function getPaymentId(name: string): Promise<string | null> {
    if (!name) return null;
    if (paymentCache.has(name)) return paymentCache.get(name)!;
    const created = await prisma.paymentMethod.create({ data: { name } });
    paymentCache.set(name, created.id);
    return created.id;
  }

  async function getTagId(name: string): Promise<string | null> {
    if (!name) return null;
    if (tagCache.has(name)) return tagCache.get(name)!;
    const created = await prisma.tag.create({ data: { name } });
    tagCache.set(name, created.id);
    return created.id;
  }

  let success = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const platformId = await getPlatformId(r["プラットフォーム"]);
      const categoryId = await getCategoryId(r["カテゴリ"]);
      const supplierId = await getSupplierId(r["仕入先"]);
      const paymentMethodId = await getPaymentId(r["決済方法"]);

      // タグ処理
      const tagIds: string[] = [];
      if (r["タグ"]) {
        const tagId = await getTagId(r["タグ"]);
        if (tagId) tagIds.push(tagId);
      }

      const status = STATUS_MAP[r["商品ステータス"]] || "before_listing";

      await prisma.product.create({
        data: {
          name: r["商品名"] || `商品${i + 1}`,
          code: r["独自商品コード"] || null,
          sellingPrice: parseFloat0(r["販売価格"]),
          purchasePrice: parseFloat0(r["仕入価格"]),
          shippingIncome: parseFloat0(r["送料（購入者負担分）"]),
          shippingCost: parseFloat0(r["送料"]),
          packagingCost: parseFloat0(r["梱包費"]),
          commissionRate: parseFloat0(r["手数料率"]) || null,
          commission: parseFloat0(r["手数料"]),
          tradingStatus: status,
          platformId,
          categoryId,
          supplierId,
          paymentMethodId,
          purchaseDate: parseDate(r["仕入れ日"]),
          listingDate: parseDate(r["出品日"]),
          paymentDate: parseDate(r["入金日"]),
          shippingDate: parseDate(r["発送日"]),
          completionDate: parseDate(r["取引完了日"]),
          memo: r["メモ"] || null,
          invoiceNumber: r["インボイス番号"] || null,
          tags: tagIds.length
            ? { create: tagIds.map((id) => ({ tagId: id })) }
            : undefined,
        },
      });
      success++;
      if (success % 200 === 0) console.log(`  ${success}件完了...`);
    } catch (e: any) {
      errors++;
      console.error(`行${i + 2}エラー: ${r["商品名"]?.substring(0, 30)} - ${e.message}`);
    }
  }

  console.log();
  console.log("=== インポート完了 ===");
  console.log(`成功: ${success}件`);
  console.log(`エラー: ${errors}件`);
  console.log(`プラットフォーム: ${platformCache.size}件`);
  console.log(`カテゴリ: ${categoryCache.size}件`);
  console.log(`仕入先: ${supplierCache.size}件`);
  console.log(`決済方法: ${paymentCache.size}件`);
  console.log(`タグ: ${tagCache.size}件`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
