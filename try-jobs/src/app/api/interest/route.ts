import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { buildQuestions } from "@/lib/screening";
import { startSmsScreening } from "@/lib/smsScreening";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { startScreeningCall } from "@/lib/vapi";
import type { Opening } from "@/lib/types";

export const runtime = "nodejs";

const InterestSchema = z.object({
  openingId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(20),
  earliestAvailability: z.string().trim().max(200).default(""),
});

// Per-phone cooldown: at most this many new applications per hour across all
// openings (call-cost / abuse guardrail, PRD §11.5).
const PER_PHONE_HOURLY_LIMIT = 3;

export async function POST(req: Request) {
  const parsed = InterestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { openingId, name, earliestAvailability } = parsed.data;

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return NextResponse.json(
      { error: "Please enter a valid phone number" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  const { data: opening } = await db
    .from("openings")
    .select("*")
    .eq("id", openingId)
    .eq("status", "open")
    .single<Opening>();
  if (!opening) {
    return NextResponse.json(
      { error: "This opening is no longer available" },
      { status: 404 },
    );
  }

  // Screening cap per opening (PRD §11.5)
  const { count: openingCount } = await db
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("opening_id", openingId);
  if ((openingCount ?? 0) >= opening.screening_cap) {
    return NextResponse.json(
      { error: "This opening has reached its screening limit" },
      { status: 429 },
    );
  }

  // Upsert seeker by phone
  const { data: seeker, error: seekerError } = await db
    .from("seekers")
    .upsert(
      { phone, name, earliest_availability: earliestAvailability },
      { onConflict: "phone" },
    )
    .select()
    .single();
  if (seekerError || !seeker) {
    console.error("[interest] seeker upsert failed:", seekerError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  // Per-phone rate limit
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await db
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("seeker_id", seeker.id)
    .gte("created_at", hourAgo);
  if ((recentCount ?? 0) >= PER_PHONE_HOURLY_LIMIT) {
    return NextResponse.json(
      { error: "Too many applications from this number — try again later" },
      { status: 429 },
    );
  }

  const { data: application, error: appError } = await db
    .from("applications")
    .insert({
      opening_id: openingId,
      seeker_id: seeker.id,
      screening_questions: buildQuestions(opening),
    })
    .select()
    .single();
  if (appError || !application) {
    if (appError?.code === "23505") {
      return NextResponse.json(
        { error: "You've already applied to this opening" },
        { status: 409 },
      );
    }
    console.error("[interest] application insert failed:", appError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  // Trigger the screening call; fall back to SMS if the call can't be placed.
  try {
    const { callId } = await startScreeningCall({
      applicationId: application.id,
      seekerName: seeker.name,
      seekerPhone: phone,
      opening,
    });
    await db
      .from("applications")
      .update({ screening_status: "calling", vapi_call_id: callId })
      .eq("id", application.id);
    return NextResponse.json({ ok: true, channel: "call" });
  } catch (err) {
    console.error("[interest] VAPI call failed, falling back to SMS:", err);
    await db
      .from("applications")
      .update({ screening_status: "call_failed" })
      .eq("id", application.id);
    try {
      await startSmsScreening(db, application, seeker, opening);
      return NextResponse.json({ ok: true, channel: "sms" });
    } catch (smsErr) {
      console.error("[interest] SMS fallback failed:", smsErr);
      return NextResponse.json({ ok: true, channel: "pending" });
    }
  }
}
