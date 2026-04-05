import { NextResponse } from "next/server";
import { getLandscapeImageBuffer, deleteLandscapeImage } from "@/lib/image-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (!filename || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const buffer = await getLandscapeImageBuffer(filename);
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
      "Cache-Control": "public, max-age=86400",
    },
  });
}

/** DELETE /api/landscapes/image/[filename] — delete a stored landscape image. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!filename || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  try {
    const deleted = await deleteLandscapeImage(filename);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, filename });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete landscape" },
      { status: 500 },
    );
  }
}
