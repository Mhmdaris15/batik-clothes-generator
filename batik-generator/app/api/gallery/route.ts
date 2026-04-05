import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import {
  listAllGarments,
  listAllResults,
  listAllFaces,
  listAllLandscapes,
} from "@/lib/image-store";

export type GalleryItem = {
  filename: string;
  outfitId: string;
  regionId: string;
  gender: string;
  category: "faces" | "garments" | "results" | "landscapes";
  url: string;
  prompt?: string;
  createdAt: string;
};

/** GET /api/gallery — return all generated images across faces, garments, results, landscapes. */
export async function GET() {
  try {
    const [faces, garments, results, landscapes] = await Promise.all([
      listAllFaces(),
      listAllGarments(),
      listAllResults(),
      listAllLandscapes(),
    ]);

    const items: GalleryItem[] = [
      ...faces.map((f) => ({ ...f, category: "faces" as const })),
      ...garments.map((g) => ({ ...g, category: "garments" as const })),
      ...results.map((r) => ({ ...r, category: "results" as const })),
      ...landscapes.map((l) => ({ ...l, category: "landscapes" as const })),
    ];

    // Sort newest first
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      items,
      counts: {
        faces: faces.length,
        garments: garments.length,
        results: results.length,
        landscapes: landscapes.length,
        total: items.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load gallery" },
      { status: 500 },
    );
  }
}
