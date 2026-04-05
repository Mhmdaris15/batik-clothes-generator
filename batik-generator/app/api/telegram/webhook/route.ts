import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server-env";
import { linkChat, storePhoto } from "@/lib/telegram-sessions";

export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/webhook
 *
 * Telegram Bot API sends updates here.
 * We handle two types:
 *   1. /start <sessionId>  — link the Telegram chat to a website session
 *   2. Photo message       — download the photo & store it for the session
 */
export async function POST(req: NextRequest) {
  const botToken = getServerEnv("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 500 });
  }

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message as Record<string, unknown> | undefined;
  if (!message) {
    return NextResponse.json({ ok: true });
  }

  const chat = message.chat as Record<string, unknown> | undefined;
  const chatId = chat?.id as number | undefined;
  if (!chatId) {
    return NextResponse.json({ ok: true });
  }

  // ── Handle /start command ──────────────────────────────────────────────────
  const text = (message.text as string) || "";
  if (text.startsWith("/start ")) {
    const sessionId = text.slice("/start ".length).trim();
    if (sessionId) {
      const session = linkChat(sessionId, chatId);
      if (session) {
        await sendTelegramMessage(
          botToken,
          chatId,
          "✅ Connected! Now send your face photo and it will appear on the website."
        );
      } else {
        await sendTelegramMessage(
          botToken,
          chatId,
          "⚠️ Session expired or not found. Please scan the QR code again."
        );
      }
    } else {
      await sendTelegramMessage(
        botToken,
        chatId,
        "👋 Welcome to Batik Clothes Generator!\n\nTo send a photo, scan the QR code shown on the website first."
      );
    }
    return NextResponse.json({ ok: true });
  }

  // ── Handle photo message ───────────────────────────────────────────────────
  const photos = message.photo as Array<Record<string, unknown>> | undefined;
  if (photos && photos.length > 0) {
    // Get the highest resolution photo (last in the array)
    const bestPhoto = photos[photos.length - 1];
    const fileId = bestPhoto.file_id as string;

    try {
      // Get file path from Telegram
      const fileResp = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
      );
      const fileData = (await fileResp.json()) as {
        ok: boolean;
        result?: { file_path: string };
      };

      if (!fileData.ok || !fileData.result?.file_path) {
        await sendTelegramMessage(botToken, chatId, "❌ Failed to process photo. Please try again.");
        return NextResponse.json({ ok: true });
      }

      // Download the file
      const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
      const imgResp = await fetch(downloadUrl);
      const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
      const b64 = imgBuffer.toString("base64");

      const stored = storePhoto(chatId, b64);
      if (stored) {
        await sendTelegramMessage(
          botToken,
          chatId,
          "📸 Photo received! Check the website — your photo should appear momentarily."
        );
      } else {
        await sendTelegramMessage(
          botToken,
          chatId,
          "⚠️ No active session linked. Please scan the QR code on the website first, then send your photo."
        );
      }
    } catch {
      await sendTelegramMessage(botToken, chatId, "❌ Error processing photo. Please try again.");
    }
    return NextResponse.json({ ok: true });
  }

  // ── Unhandled message type ─────────────────────────────────────────────────
  await sendTelegramMessage(
    botToken,
    chatId,
    "📷 Please send a face photo, or scan the QR code on the website to start a new session."
  );

  return NextResponse.json({ ok: true });
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
