import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { listAllGarments } from "@/lib/image-store";

/** GET /api/garments — list all previously generated garment images. */
export async function GET() {
  try {
    const garments = await listAllGarments();
    return NextResponse.json({ garments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list garments" },
      { status: 500 },
    );
  }
}
