import { generatePost, type GenerateRequest } from "@/lib/ai/generate-post";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();

    if (!body.mode) {
      return NextResponse.json({ error: "mode is required" }, { status: 400 });
    }

    const result = await generatePost(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("AI generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI generation failed" },
      { status: 500 }
    );
  }
}
