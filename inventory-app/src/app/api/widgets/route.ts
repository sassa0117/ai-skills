import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const widgets = await prisma.dashboardWidget.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(widgets);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Get max sortOrder
  const maxWidget = await prisma.dashboardWidget.findFirst({
    orderBy: { sortOrder: "desc" },
  });
  const nextOrder = (maxWidget?.sortOrder ?? -1) + 1;

  const widget = await prisma.dashboardWidget.create({
    data: {
      ...body,
      sortOrder: body.sortOrder ?? nextOrder,
    },
  });
  return NextResponse.json(widget, { status: 201 });
}
