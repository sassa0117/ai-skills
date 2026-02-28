import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { checkNgPatterns } from "@/lib/ng-checker";

export async function POST(request: NextRequest) {
  const { text } = await request.json();

  const patterns = await prisma.ngPattern.findMany();
  const result = checkNgPatterns(text, patterns);

  return NextResponse.json(result);
}
