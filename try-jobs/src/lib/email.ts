import { Resend } from "resend";
import { requireEnv } from "@/lib/env";

let cached: Resend | null = null;

function client(): Resend {
  if (!cached) cached = new Resend(requireEnv("RESEND_API_KEY"));
  return cached;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  await client().emails.send({
    from: process.env.EMAIL_FROM ?? "Try Jobs <onboarding@resend.dev>",
    to: params.to,
    subject: params.subject,
    text: params.text,
  });
}
