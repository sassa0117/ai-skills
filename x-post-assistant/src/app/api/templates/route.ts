import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const templates = await prisma.postTemplate.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(templates);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const template = await prisma.postTemplate.create({ data: body });
  return NextResponse.json(template, { status: 201 });
}
