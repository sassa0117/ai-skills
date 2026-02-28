import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { orderedIds } = body as { orderedIds: string[] };

  // Update sort orders
  for (let i = 0; i < orderedIds.length; i++) {
    await prisma.dashboardWidget.update({
      where: { id: orderedIds[i] },
      data: { sortOrder: i },
    });
  }

  return NextResponse.json({ success: true });
}
