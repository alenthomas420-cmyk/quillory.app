import { NextResponse } from "next/server";
import { clampAnalysis } from "@/lib/screening";
import { startSmsScreening } from "@/lib/smsScreening";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Application, Opening, Seeker } from "@/lib/types";

export const runtime = "nodejs";

// VAPI server webhook. We only act on the end-of-call report, which carries
// the transcript, recording URL, summary, and the structured analysis
// requested in the assistant's analysisPlan.
interface VapiEndOfCallMessage {
  type: string;
  endedReason?: string;
  call?: { id?: string; metadata?: { applicationId?: string } };
  artifact?: { transcript?: string; recordingUrl?: string };
  analysis?: { summary?: string; structuredData?: unknown };
}

// endedReasons that mean the candidate never got screened — trigger the SMS
// fallback instead of failing the application.
const NO_SCREENING_REASONS = [
  "customer-did-not-answer",
  "customer-busy",
  "twilio-failed-to-connect-call",
  "voicemail",
  "no-answer",
];

export async function POST(req: Request) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-vapi-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    message?: VapiEndOfCallMessage;
  } | null;
  const message = body?.message;
  if (!message || message.type !== "end-of-call-report") {
    return NextResponse.json({ ok: true });
  }

  const applicationId = message.call?.metadata?.applicationId;
  if (!applicationId) return NextResponse.json({ ok: true });

  const db = supabaseAdmin();
  const { data: application } = await db
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .single<Application>();
  if (!application || application.screening_status === "complete") {
    return NextResponse.json({ ok: true });
  }

  const [{ data: opening }, { data: seeker }] = await Promise.all([
    db
      .from("openings")
      .select("*")
      .eq("id", application.opening_id)
      .single<Opening>(),
    db
      .from("seekers")
      .select("*")
      .eq("id", application.seeker_id)
      .single<Seeker>(),
  ]);
  if (!opening || !seeker) return NextResponse.json({ ok: true });

  const endedReason = message.endedReason ?? "";
  const transcript = message.artifact?.transcript ?? "";
  const analysis = clampAnalysis(message.analysis?.structuredData);

  const callNeverHappened =
    NO_SCREENING_REASONS.some((r) => endedReason.includes(r)) ||
    (!transcript && !analysis);

  if (callNeverHappened) {
    await db
      .from("applications")
      .update({ screening_status: "call_failed" })
      .eq("id", applicationId);
    try {
      await startSmsScreening(db, application, seeker, opening);
    } catch (err) {
      console.error("[vapi webhook] SMS fallback failed:", err);
    }
    return NextResponse.json({ ok: true });
  }

  await db
    .from("applications")
    .update({
      screening_status: analysis ? "complete" : "failed",
      status: analysis ? "screened" : application.status,
      transcript: transcript || null,
      recording_url: message.artifact?.recordingUrl ?? null,
      summary: analysis?.summary ?? message.analysis?.summary ?? null,
      fit_score: analysis?.fit_score ?? null,
      score_justification: analysis?.justification ?? null,
      attribute_notes: analysis?.attribute_notes ?? [],
    })
    .eq("id", applicationId);

  return NextResponse.json({ ok: true });
}
