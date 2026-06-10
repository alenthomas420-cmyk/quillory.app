import { NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { handleSmsAnswer } from "@/lib/smsScreening";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateTwilioSignature } from "@/lib/twilio";
import type { Application, Opening, Seeker } from "@/lib/types";

export const runtime = "nodejs";

// Inbound SMS from Twilio drives the SMS-fallback screening: each reply is
// recorded as the answer to the current question and the next one is sent.
export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });

  const valid = validateTwilioSignature(
    req.headers.get("x-twilio-signature"),
    `${appUrl()}/api/webhooks/twilio/sms`,
    params,
  );
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const from = params.From;
  const text = (params.Body ?? "").trim();
  if (!from || !text) return twiml();

  const db = supabaseAdmin();

  const { data: seeker } = await db
    .from("seekers")
    .select("*")
    .eq("phone", from)
    .single<Seeker>();
  if (!seeker) return twiml();

  const { data: application } = await db
    .from("applications")
    .select("*")
    .eq("seeker_id", seeker.id)
    .eq("screening_status", "sms_in_progress")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Application>();
  if (!application) return twiml();

  const { data: opening } = await db
    .from("openings")
    .select("*")
    .eq("id", application.opening_id)
    .single<Opening>();
  if (!opening) return twiml();

  try {
    await handleSmsAnswer(db, application, seeker, opening, text);
  } catch (err) {
    console.error("[twilio sms webhook] failed:", err);
  }

  return twiml();
}

// Twilio expects TwiML; an empty <Response> means "no auto-reply" (we send
// follow-ups via the REST API instead so they're recorded consistently).
function twiml() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
