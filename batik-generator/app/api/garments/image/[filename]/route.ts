import { NextResponse } from "next/server";
import { getGarmentImageBuffer, deleteGarmentImage } from "@/lib/image-store";

/** GET /api/garments/image/[filename] — serve a stored garment image. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const buffer = await getGarmentImageBuffer(filename);

  if (!buffer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = filename.split(".").pop()?.toLowerCase();
  const mime =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
        ? "image/webp"
        : "image/png";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

/** DELETE /api/garments/image/[filename] — delete a stored garment image. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  try {
    const deleted = await deleteGarmentImage(filename);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, filename });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete garment" },
      { status: 500 },
    );
  }
}
