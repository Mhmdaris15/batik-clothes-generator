import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function GET() {
  try {
    // Cloud Run: DATA_DIR=/data; local dev: parent of cwd
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "..");
    const filePath = path.join(dataDir, "clothes_data.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load clothes data" },
      { status: 500 },
    );
  }
}
