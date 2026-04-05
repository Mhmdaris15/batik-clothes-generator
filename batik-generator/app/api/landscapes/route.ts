import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { listAllLandscapes } from "@/lib/image-store";

/** GET /api/landscapes — list all stored landscape images. */
export async function GET() {
  try {
    const landscapes = await listAllLandscapes();
    return NextResponse.json({ landscapes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list landscapes" },
      { status: 500 },
    );
  }
}
