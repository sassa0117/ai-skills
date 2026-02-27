const { PrismaClient } = require('.prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Platforms
  const yahoo = await prisma.platform.create({
    data: { name: "ヤフオク", commissionRate: 10.0 },
  });
  const mercari = await prisma.platform.create({
    data: { name: "メルカリ", commissionRate: 10.0 },
  });
  const rakuma = await prisma.platform.create({
    data: { name: "ラクマ", commissionRate: 6.0 },
  });
  const amazon = await prisma.platform.create({
    data: { name: "Amazon", commissionRate: 15.0 },
  });

  // Categories
  const electronics = await prisma.category.create({ data: { name: "家電" } });
  const fashion = await prisma.category.create({ data: { name: "ファッション" } });
  const books = await prisma.category.create({ data: { name: "本・雑誌" } });
  const games = await prisma.category.create({ data: { name: "ゲーム" } });
  const hobby = await prisma.category.create({ data: { name: "ホビー" } });

  // Tags
  const tagNew = await prisma.tag.create({ data: { name: "新品" } });
  const tagUsed = await prisma.tag.create({ data: { name: "中古" } });
  const tagRare = await prisma.tag.create({ data: { name: "レア" } });
  const tagSale = await prisma.tag.create({ data: { name: "セール品" } });

  // Suppliers
  const supplier1 = await prisma.supplier.create({ data: { name: "ブックオフ" } });
  const supplier2 = await prisma.supplier.create({ data: { name: "ハードオフ" } });
  const supplier3 = await prisma.supplier.create({ data: { name: "セカンドストリート" } });
  const supplier4 = await prisma.supplier.create({ data: { name: "ネット仕入" } });

  // Payment Methods
  const cash = await prisma.paymentMethod.create({ data: { name: "現金" } });
  const credit = await prisma.paymentMethod.create({ data: { name: "クレジットカード" } });
  const paypay = await prisma.paymentMethod.create({ data: { name: "PayPay" } });

  // Expense Categories
  await prisma.expenseCategory.create({ data: { name: "交通費" } });
  await prisma.expenseCategory.create({ data: { name: "梱包資材" } });
  await prisma.expenseCategory.create({ data: { name: "ツール・サービス" } });
  const expCatTravel = await prisma.expenseCategory.create({ data: { name: "ガソリン代" } });

  // Sample Products
  const productData = [
    {
      name: "Nintendo Switch 有機ELモデル",
      code: "NSW-001",
      sellingPrice: 38000,
      purchasePrice: 28000,
      shippingCost: 1200,
      packagingCost: 200,
      commission: 3800,
      shippingIncome: 0,
      tradingStatus: "completed",
      platformId: yahoo.id,
      categoryId: games.id,
      supplierId: supplier2.id,
      paymentMethodId: cash.id,
      purchaseDate: new Date("2026-01-15"),
      listingDate: new Date("2026-01-17"),
      paymentDate: new Date("2026-01-25"),
      completionDate: new Date("2026-01-25"),
      tags: { create: [{ tagId: tagUsed.id }] },
    },
    {
      name: "AirPods Pro 第2世代",
      code: "APP-002",
      sellingPrice: 25000,
      purchasePrice: 15000,
      shippingCost: 500,
      packagingCost: 100,
      commission: 2500,
      shippingIncome: 0,
      tradingStatus: "completed",
      platformId: mercari.id,
      categoryId: electronics.id,
      supplierId: supplier1.id,
      paymentMethodId: credit.id,
      purchaseDate: new Date("2026-01-20"),
      listingDate: new Date("2026-01-22"),
      paymentDate: new Date("2026-02-01"),
      completionDate: new Date("2026-02-01"),
      tags: { create: [{ tagId: tagNew.id }] },
    },
    {
      name: "Supreme Box Logo パーカー",
      code: "SPR-003",
      sellingPrice: 45000,
      purchasePrice: 22000,
      shippingCost: 800,
      packagingCost: 150,
      commission: 4500,
      shippingIncome: 0,
      tradingStatus: "completed",
      platformId: yahoo.id,
      categoryId: fashion.id,
      supplierId: supplier3.id,
      paymentMethodId: paypay.id,
      purchaseDate: new Date("2026-02-01"),
      listingDate: new Date("2026-02-03"),
      paymentDate: new Date("2026-02-10"),
      completionDate: new Date("2026-02-10"),
      tags: { create: [{ tagId: tagRare.id }] },
    },
    {
      name: "ポケモンカード 未開封BOX",
      code: "PKM-004",
      sellingPrice: 12000,
      purchasePrice: 5500,
      shippingCost: 400,
      packagingCost: 100,
      commission: 1200,
      shippingIncome: 0,
      tradingStatus: "completed",
      platformId: mercari.id,
      categoryId: hobby.id,
      supplierId: supplier4.id,
      paymentMethodId: credit.id,
      purchaseDate: new Date("2026-02-05"),
      listingDate: new Date("2026-02-06"),
      paymentDate: new Date("2026-02-12"),
      completionDate: new Date("2026-02-12"),
      tags: { create: [{ tagId: tagNew.id }] },
    },
    {
      name: "BOSE QuietComfort 45",
      code: "BSE-005",
      sellingPrice: 22000,
      purchasePrice: 12000,
      shippingCost: 600,
      packagingCost: 150,
      commission: 2200,
      shippingIncome: 0,
      tradingStatus: "completed",
      platformId: rakuma.id,
      categoryId: electronics.id,
      supplierId: supplier2.id,
      paymentMethodId: cash.id,
      purchaseDate: new Date("2026-02-08"),
      listingDate: new Date("2026-02-09"),
      paymentDate: new Date("2026-02-18"),
      completionDate: new Date("2026-02-18"),
      tags: { create: [{ tagId: tagUsed.id }] },
    },
    {
      name: "iPhone 15 Pro ケース セット",
      code: "IPH-006",
      sellingPrice: 5800,
      purchasePrice: 1500,
      shippingCost: 300,
      packagingCost: 50,
      commission: 580,
      shippingIncome: 0,
      tradingStatus: "completed",
      platformId: mercari.id,
      categoryId: electronics.id,
      supplierId: supplier4.id,
      paymentMethodId: credit.id,
      purchaseDate: new Date("2026-02-10"),
      listingDate: new Date("2026-02-11"),
      paymentDate: new Date("2026-02-15"),
      completionDate: new Date("2026-02-15"),
      tags: { create: [{ tagId: tagNew.id }, { tagId: tagSale.id }] },
    },
    {
      name: "ワンピース全巻セット 1-107巻",
      code: "OP-007",
      sellingPrice: 35000,
      purchasePrice: 15000,
      shippingCost: 2500,
      packagingCost: 300,
      commission: 3500,
      shippingIncome: 0,
      tradingStatus: "shipped",
      platformId: yahoo.id,
      categoryId: books.id,
      supplierId: supplier1.id,
      paymentMethodId: cash.id,
      purchaseDate: new Date("2026-02-15"),
      listingDate: new Date("2026-02-16"),
      shippingDate: new Date("2026-02-22"),
      tags: { create: [{ tagId: tagUsed.id }] },
    },
    {
      name: "PS5 DualSense コントローラー",
      code: "PS5-008",
      sellingPrice: 8500,
      purchasePrice: 4000,
      shippingCost: 500,
      packagingCost: 100,
      commission: 850,
      shippingIncome: 0,
      tradingStatus: "listing",
      platformId: mercari.id,
      categoryId: games.id,
      supplierId: supplier2.id,
      paymentMethodId: paypay.id,
      purchaseDate: new Date("2026-02-18"),
      listingDate: new Date("2026-02-19"),
      tags: { create: [{ tagId: tagNew.id }] },
    },
    {
      name: "LEGO テクニック フェラーリ SP3",
      code: "LGO-009",
      sellingPrice: 65000,
      purchasePrice: 42000,
      shippingCost: 1800,
      packagingCost: 500,
      commission: 6500,
      shippingIncome: 0,
      tradingStatus: "listing",
      platformId: amazon.id,
      categoryId: hobby.id,
      supplierId: supplier4.id,
      paymentMethodId: credit.id,
      purchaseDate: new Date("2026-02-20"),
      listingDate: new Date("2026-02-21"),
      tags: { create: [{ tagId: tagNew.id }, { tagId: tagRare.id }] },
    },
    {
      name: "Dyson V15 Detect",
      code: "DYS-010",
      sellingPrice: 48000,
      purchasePrice: 30000,
      shippingCost: 1500,
      packagingCost: 300,
      commission: 0,
      shippingIncome: 0,
      tradingStatus: "before_listing",
      categoryId: electronics.id,
      supplierId: supplier2.id,
      paymentMethodId: cash.id,
      purchaseDate: new Date("2026-02-24"),
      tags: { create: [{ tagId: tagUsed.id }] },
    },
  ];

  for (const data of productData) {
    await prisma.product.create({ data });
  }

  // Sample Expenses
  await prisma.expense.create({
    data: {
      date: new Date("2026-02-01"),
      amount: 3500,
      memo: "仕入ツアー交通費",
      categoryId: expCatTravel.id,
    },
  });
  await prisma.expense.create({
    data: {
      date: new Date("2026-02-10"),
      amount: 2000,
      memo: "プチプチ・段ボール購入",
    },
  });
  await prisma.expense.create({
    data: {
      date: new Date("2026-02-15"),
      amount: 5000,
      memo: "ガソリン代",
      categoryId: expCatTravel.id,
    },
  });

  // Default Dashboard Widgets
  await prisma.dashboardWidget.create({
    data: {
      type: "single_value",
      period: "monthly",
      periodRange: "current",
      metric: "profit",
      dateField: "completionDate",
      tradingStatus: "completed",
      showComparison: false,
      sortOrder: 0,
    },
  });
  await prisma.dashboardWidget.create({
    data: {
      type: "bar_chart",
      period: "daily",
      periodRange: "current",
      metric: "profit",
      dateField: "completionDate",
      tradingStatus: "completed",
      showComparison: false,
      sortOrder: 1,
    },
  });
  await prisma.dashboardWidget.create({
    data: {
      type: "bar_chart",
      period: "monthly",
      periodRange: "current",
      metric: "profit",
      dateField: "completionDate",
      tradingStatus: "completed",
      showComparison: false,
      sortOrder: 2,
    },
  });
  await prisma.dashboardWidget.create({
    data: {
      type: "bar_chart",
      period: "monthly",
      periodRange: "current",
      metric: "product_count",
      dateField: "completionDate",
      tradingStatus: "completed",
      showComparison: false,
      sortOrder: 3,
    },
  });

  console.log("Seed data created successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
