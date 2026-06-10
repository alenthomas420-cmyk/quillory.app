import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyFeedbackToken } from "@/lib/tokens";
import type { Booking } from "@/lib/types";

export const runtime = "nodejs";

const FeedbackSchema = z.object({
  token: z.string().min(10),
  outcome: z.enum(["would_hire", "would_not_hire", "undecided"]).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().trim().max(2000).default(""),
});

// Both parties submit feedback through signed links — no login needed
// (PRD §5.4). When the employer submits their outcome, the seeker's payment
// is marked released. Actual payout transfer is manual for MVP (§11.1
// [Assumption] — flagged for the Stripe Connect decision).
export async function POST(req: Request) {
  const parsed = FeedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { token, outcome, rating, notes } = parsed.data;

  const payload = verifyFeedbackToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "This link is invalid or has expired" },
      { status: 401 },
    );
  }

  if (payload.role === "employer" && !outcome) {
    return NextResponse.json(
      { error: "Please choose an outcome" },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();
  const { data: booking } = await db
    .from("bookings")
    .select("*")
    .eq("id", payload.bookingId)
    .single<Booking>();
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const { error: insertError } = await db.from("feedback").insert({
    booking_id: payload.bookingId,
    author_role: payload.role,
    outcome: payload.role === "employer" ? outcome : null,
    rating: rating ?? null,
    notes,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "Feedback was already submitted for this try-day" },
        { status: 409 },
      );
    }
    console.error("[feedback] insert failed:", insertError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  // Employer feedback releases the seeker's payment (PRD §5.4.3).
  if (payload.role === "employer" && booking.payment_status === "paid") {
    await db
      .from("bookings")
      .update({ payment_status: "released" })
      .eq("id", payload.bookingId);
  }

  return NextResponse.json({ ok: true });
}
