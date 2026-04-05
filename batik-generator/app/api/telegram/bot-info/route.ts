import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";

/**
 * GET /api/telegram/bot-info
 *
 * Returns the Telegram bot username for generating QR code links.
 */
export async function GET() {
  const botToken = getServerEnv("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    return NextResponse.json({ configured: false, username: null });
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = (await resp.json()) as {
      ok: boolean;
      result?: { username: string; first_name: string };
    };

    if (data.ok && data.result?.username) {
      return NextResponse.json({
        configured: true,
        username: data.result.username,
        name: data.result.first_name,
      });
    }
  } catch {
    /* fall through */
  }

  return NextResponse.json({ configured: false, username: null });
}
