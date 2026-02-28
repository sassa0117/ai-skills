import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function check() {
  const total = await prisma.product.count();
  const byStatus = await prisma.product.groupBy({
    by: ["tradingStatus"],
    _count: true,
  });
  const platforms = await prisma.platform.findMany();
  const categories = await prisma.category.findMany();
  const tags = await prisma.tag.findMany();
  const suppliers = await prisma.supplier.findMany();

  console.log("=== DB確認 ===");
  console.log("商品総数:", total);
  console.log();
  console.log("ステータス別:");
  byStatus.forEach((s) =>
    console.log("  " + s.tradingStatus + ": " + s._count + "件")
  );
  console.log();
  console.log("プラットフォーム:", platforms.map((p) => p.name).join(", "));
  console.log("カテゴリ:", categories.map((c) => c.name).join(", "));
  console.log("タグ:", tags.map((t) => t.name).join(", "));
  console.log("仕入先:", suppliers.map((s) => s.name).join(", "));

  const samples = await prisma.product.findMany({
    take: 5,
    include: { platform: true, category: true },
    orderBy: { sellingPrice: "desc" },
  });
  console.log();
  console.log("売上TOP5:");
  samples.forEach((p) => {
    const profit =
      p.sellingPrice -
      p.purchasePrice -
      p.shippingCost -
      p.packagingCost -
      p.commission;
    console.log(
      `  ¥${p.sellingPrice} → 利益¥${profit} | ${p.name.substring(0, 40)}`
    );
  });

  await prisma.$disconnect();
}

check();
