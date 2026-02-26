import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const categories = await prisma.expenseCategory.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const category = await prisma.expenseCategory.create({ data: body });
  return NextResponse.json(category, { status: 201 });
}
