import twilio from "twilio";
import { requireEnv } from "@/lib/env";

let cached: ReturnType<typeof twilio> | null = null;

function client() {
  if (!cached) {
    cached = twilio(
      requireEnv("TWILIO_ACCOUNT_SID"),
      requireEnv("TWILIO_AUTH_TOKEN"),
    );
  }
  return cached;
}

export async function sendSms(to: string, body: string): Promise<void> {
  await client().messages.create({
    to,
    from: requireEnv("TWILIO_FROM_NUMBER"),
    body,
  });
}

// Validates X-Twilio-Signature on inbound webhooks so only Twilio can drive
// the SMS screening state machine.
export function validateTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  return twilio.validateRequest(
    requireEnv("TWILIO_AUTH_TOKEN"),
    signature,
    url,
    params,
  );
}
