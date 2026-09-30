// Password reset is the only thing this app sends by email, and it is the only
// reason a mail transport exists at all.
//
// Transport is Resend's HTTPS API rather than SMTP. That is not a style
// choice: the CRM deploys to Cloudflare Workers, and `global_fetch_strictly_public`
// in wrangler.jsonc means only public HTTPS egress is available. nodemailer's
// raw TCP connection to a mail server cannot be made from that runtime.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendResult =
  | { ok: true; delivered: boolean }
  | { ok: false; error: string };

function baseUrl(): string {
  return (
    process.env.CRM_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://patangfuturehomes.com"
  ).replace(/\/+$/, "");
}

function fromAddress(): string {
  return process.env.MAIL_FROM_EMAIL || "Patang Future Homes <no-reply@patangfuturehomes.com>";
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function buildPasswordResetUrl(token: string): string {
  return `${baseUrl()}/crm/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  // With no key configured we still want the flow to be exercisable in local
  // dev, so the link goes to the server log instead of a mailbox. It is logged
  // loudly and flagged as undelivered so it is never mistaken for a real send.
  if (!apiKey) {
    console.warn(
      `[crm] RESEND_API_KEY is not set - password reset email for ${params.to} was NOT sent.`
    );
    console.warn(`[crm] reset link (dev only): ${params.resetUrl}`);
    return { ok: true, delivered: false };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [params.to],
      subject: "Reset your Patang CRM password",
      text: [
        `Hi ${params.name},`,
        "",
        "We received a request to reset the password for your Patang CRM account.",
        "Open the link below to choose a new one:",
        "",
        params.resetUrl,
        "",
        "The link is valid for 30 minutes and can only be used once.",
        "",
        "If you did not request this, you can ignore this email - your password",
        "has not changed and nobody can access your account without the link.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, error: `resend responded ${response.status}: ${detail}` };
  }

  return { ok: true, delivered: true };
}
