import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "stock");

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    // ディレクトリ確保
    await mkdir(UPLOAD_DIR, { recursive: true });

    // ファイル名: timestamp + ランダム
    const ext = file.name?.split(".").pop() || "png";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // 書き込み
    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    const imageUrl = `/uploads/stock/${filename}`;
    return NextResponse.json({ imageUrl });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
