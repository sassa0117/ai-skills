import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
  const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());

  // Get completed products for the specified month
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  const monthlyProducts = await prisma.product.findMany({
    where: {
      tradingStatus: "completed",
      completionDate: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
  });

  // Calculate monthly profit
  const monthlyProfit = monthlyProducts.reduce((sum, p) => {
    const income = p.sellingPrice + p.shippingIncome;
    const expense = p.purchasePrice + p.shippingCost + p.packagingCost + p.commission;
    return sum + (income - expense);
  }, 0);

  // Daily profit for the month
  const dailyProfits: Record<string, number> = {};
  for (let d = 1; d <= endOfMonth.getDate(); d++) {
    const key = `${d}`;
    dailyProfits[key] = 0;
  }
  monthlyProducts.forEach((p) => {
    if (p.completionDate) {
      const day = new Date(p.completionDate).getDate().toString();
      const income = p.sellingPrice + p.shippingIncome;
      const expense = p.purchasePrice + p.shippingCost + p.packagingCost + p.commission;
      dailyProfits[day] = (dailyProfits[day] || 0) + (income - expense);
    }
  });

  // Monthly profit for the year
  const yearlyProducts = await prisma.product.findMany({
    where: {
      tradingStatus: "completed",
      completionDate: {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31, 23, 59, 59),
      },
    },
  });

  const monthlyProfits: Record<string, number> = {};
  for (let m = 1; m <= 12; m++) {
    monthlyProfits[`${m}月`] = 0;
  }
  yearlyProducts.forEach((p) => {
    if (p.completionDate) {
      const m = new Date(p.completionDate).getMonth() + 1;
      const income = p.sellingPrice + p.shippingIncome;
      const expense = p.purchasePrice + p.shippingCost + p.packagingCost + p.commission;
      monthlyProfits[`${m}月`] += income - expense;
    }
  });

  // Product count stats
  const productStats = await prisma.product.groupBy({
    by: ["tradingStatus"],
    _count: true,
  });

  return NextResponse.json({
    monthlyProfit,
    dailyProfits,
    monthlyProfits,
    productStats,
    year,
    month,
  });
}
