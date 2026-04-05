import { NextRequest, NextResponse } from "next/server";
import { getOrCreateSession, pollPhoto, isSessionLinked } from "@/lib/telegram-sessions";

export const dynamic = "force-dynamic";

/**
 * GET /api/telegram/poll?sessionId=xxx
 *
 * Called by the website to check:
 *  - Whether the session is linked to a Telegram chat
 *  - Whether a photo has been received
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  // Ensure session exists
  getOrCreateSession(sessionId);

  const linked = isSessionLinked(sessionId);
  const photoB64 = pollPhoto(sessionId);

  return NextResponse.json({
    sessionId,
    linked,
    hasPhoto: !!photoB64,
    photoB64: photoB64 || null,
  });
}
