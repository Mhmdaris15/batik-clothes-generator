import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { promises as fs } from "node:fs";
import path from "node:path";

export async function GET() {
  try {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "..");
    const filePath = path.join(dataDir, "models_config.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load models config" },
      { status: 500 },
    );
  }
}
