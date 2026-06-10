import { NextResponse } from "next/server";
import { z } from "zod";
import { createBookingCheckout } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { Application, Opening, Seeker } from "@/lib/types";

export const runtime = "nodejs";

const BookingSchema = z.object({
  applicationId: z.string().uuid(),
  hours: z.number().min(1).max(12).default(4),
});

// Employer books a screened candidate (PRD §5.3): creates the booking and
// returns a Stripe Checkout URL for the try-day payment.
export async function POST(req: Request) {
  const parsed = BookingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { applicationId, hours } = parsed.data;

  // Authenticate the employer; the RLS-scoped read below doubles as the
  // ownership check (employers can only see applications to their openings).
  const authed = await supabaseServer();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: ownedApplication } = await authed
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!ownedApplication) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: application } = await db
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .single<Application>();
  if (!application || application.screening_status !== "complete") {
    return NextResponse.json(
      { error: "Candidate has not completed screening" },
      { status: 409 },
    );
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
  if (!opening || !seeker) {
    return NextResponse.json({ error: "Opening not found" }, { status: 404 });
  }

  const { data: booking, error: bookingError } = await db
    .from("bookings")
    .insert({
      application_id: applicationId,
      scheduled_at: opening.try_day_at,
      try_day_rate: opening.hourly_rate,
      hours,
    })
    .select()
    .single();
  if (bookingError || !booking) {
    if (bookingError?.code === "23505") {
      return NextResponse.json(
        { error: "This candidate is already booked" },
        { status: 409 },
      );
    }
    console.error("[bookings] insert failed:", bookingError);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  await db
    .from("applications")
    .update({ status: "booked" })
    .eq("id", applicationId);

  try {
    const { url, sessionId } = await createBookingCheckout({
      bookingId: booking.id,
      openingTitle: opening.title,
      seekerName: seeker.name,
      rate: Number(opening.hourly_rate),
      hours,
      employerEmail: user.email,
    });
    await db
      .from("bookings")
      .update({ stripe_payment_id: sessionId })
      .eq("id", booking.id);
    return NextResponse.json({ ok: true, checkoutUrl: url });
  } catch (err) {
    console.error("[bookings] Stripe checkout failed:", err);
    return NextResponse.json(
      { error: "Payment setup failed — try again" },
      { status: 502 },
    );
  }
}
