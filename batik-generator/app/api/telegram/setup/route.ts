import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/setup
 *
 * One-time call to register the webhook URL with Telegram Bot API.
 * Body: { "webhookUrl": "https://your-app.run.app/api/telegram/webhook" }
 *
 * Or call without body to use the current request host.
 */
export async function POST(req: NextRequest) {
  const botToken = getServerEnv("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  let webhookUrl: string;
  try {
    const body = await req.json().catch(() => ({}));
    webhookUrl =
      (body as Record<string, string>).webhookUrl ||
      `${req.nextUrl.origin}/api/telegram/webhook`;
  } catch {
    webhookUrl = `${req.nextUrl.origin}/api/telegram/webhook`;
  }

  const resp = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    }
  );

  const result = await resp.json();
  return NextResponse.json({ webhookUrl, telegramResponse: result });
}

/**
 * GET /api/telegram/setup — Check current webhook info.
 */
export async function GET() {
  const botToken = getServerEnv("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
  }

  const resp = await fetch(
    `https://api.telegram.org/bot${botToken}/getWebhookInfo`
  );
  const result = await resp.json();

  // Also get bot info for the username
  const meResp = await fetch(
    `https://api.telegram.org/bot${botToken}/getMe`
  );
  const meResult = await meResp.json();

  return NextResponse.json({ webhookInfo: result, botInfo: meResult });
}
