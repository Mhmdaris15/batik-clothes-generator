import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { listAllFaces } from "@/lib/image-store";

/** GET /api/faces — list all stored face images. */
export async function GET() {
  const faces = await listAllFaces();
  return NextResponse.json({ faces });
}
