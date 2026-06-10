import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireEnv } from "@/lib/env";
import { sendBookingConfirmations } from "@/lib/notifications";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Application, Booking, Employer, Opening, Seeker } from "@/lib/types";

export const runtime = "nodejs";

// checkout.session.completed confirms the booking and sends both parties
// their SMS/email confirmations (PRD §5.3.3-4).
export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      payload,
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ ok: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) return NextResponse.json({ ok: true });

  const db = supabaseAdmin();
  const { data: booking } = await db
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single<Booking>();
  if (!booking || booking.payment_status === "paid") {
    return NextResponse.json({ ok: true });
  }

  await db
    .from("bookings")
    .update({
      payment_status: "paid",
      status: "confirmed",
      stripe_payment_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : booking.stripe_payment_id,
    })
    .eq("id", bookingId);

  // Gather everyone for confirmations
  const { data: application } = await db
    .from("applications")
    .select("*")
    .eq("id", booking.application_id)
    .single<Application>();
  if (!application) return NextResponse.json({ ok: true });

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

  const { data: employer } = await db
    .from("employers")
    .select("*")
    .eq("id", opening.employer_id)
    .single<Employer>();
  if (!employer) return NextResponse.json({ ok: true });

  await sendBookingConfirmations({
    seekerName: seeker.name,
    seekerPhone: seeker.phone,
    employerEmail: employer.email,
    businessName: employer.business_name || employer.name,
    openingTitle: opening.title,
    location: opening.location,
    scheduledAt: new Date(booking.scheduled_at),
    rate: Number(booking.try_day_rate),
  });

  return NextResponse.json({ ok: true });
}
