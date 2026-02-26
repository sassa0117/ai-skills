import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";

  const where: Record<string, unknown> = {};

  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo);
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: { category: true },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(expenses);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const expense = await prisma.expense.create({
    data: {
      ...body,
      date: new Date(body.date),
    },
    include: { category: true },
  });
  return NextResponse.json(expense, { status: 201 });
}
