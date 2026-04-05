import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";

type EmailRequest = {
  to: string;
  subject?: string;
  imageUrls: string[];
  outfitName?: string;
  regionName?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EmailRequest;
    const { to, imageUrls, outfitName, regionName } = body;

    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "Valid email address required" }, { status: 400 });
    }
    if (!imageUrls?.length) {
      return NextResponse.json({ error: "No images to send" }, { status: 400 });
    }

    const apiKey = getServerEnv("RESEND_API_KEY");
    if (!apiKey) {
      return NextResponse.json({ error: "Email service not configured (RESEND_API_KEY missing)" }, { status: 500 });
    }

    const subject = body.subject || `Your Batik Clothes Generation — ${outfitName || "Results"}`;

    const imageCards = imageUrls
      .map(
        (url, i) => `
        <tr>
          <td style="padding: 10px 0;">
            <img src="${url}" alt="Generated Batik ${i + 1}" style="width: 100%; max-width: 500px; border-radius: 12px; display: block; margin: 0 auto;" />
          </td>
        </tr>`,
      )
      .join("\n");

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #1a1412 0%, #3a2a22 100%); border-radius: 16px 16px 0 0;">
              <h1 style="margin: 0; color: #c5a059; font-size: 24px; font-weight: 700;">
                Batik Clothes Generator
              </h1>
              <p style="margin: 10px 0 0; color: #a89f91; font-size: 14px;">
                by ITMO Indonesia Family
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 30px 40px;">
              <p style="margin: 0 0 10px; color: #333; font-size: 16px;">
                Here are your generated batik portraits${outfitName ? ` featuring <strong>${outfitName}</strong>` : ""}${regionName ? ` from <strong>${regionName}</strong>` : ""}.
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${imageCards}
              </table>
              <p style="margin: 20px 0 0; color: #666; font-size: 14px;">
                These images were generated using AI-powered Batik Clothes Generator. Each portrait showcases traditional Indonesian textile artistry.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 30px; text-align: center; background-color: #f8fafc; border-radius: 0 0 16px 16px;">
              <p style="margin: 0; color: #999; font-size: 11px;">
                Batik Clothes Generator &mdash; Powered by ITMO Indonesia Family
              </p>
              <p style="margin: 5px 0 0; color: #bbb; font-size: 10px;">
                Developed by <a href="https://github.com/Mhmdaris15/" style="color: #c5a059; text-decoration: none;">Muhammad Aris Septanugroho</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getServerEnv("RESEND_FROM_EMAIL", "Batik Generator <onboarding@resend.dev>"),
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[email] Resend error: ${response.status} ${errText}`);
      return NextResponse.json(
        { error: `Failed to send email: ${errText.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const data = (await response.json()) as { id: string };
    console.log(`[email] ✓ Sent to ${to} — ID: ${data.id}`);

    return NextResponse.json({ success: true, emailId: data.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email sending failed" },
      { status: 500 },
    );
  }
}
