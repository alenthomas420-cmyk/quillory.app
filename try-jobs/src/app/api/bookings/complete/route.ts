import { NextResponse } from "next/server";
import { z } from "zod";
import { sendFeedbackPrompts } from "@/lib/notifications";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import type { Application, Booking, Opening, Seeker } from "@/lib/types";

export const runtime = "nodejs";

const CompleteSchema = z.object({ bookingId: z.string().uuid() });

// Employer marks the try-day as done (PRD §5.4.1): flips the booking to
// completed and sends both parties their feedback links. (MVP keeps this as
// an explicit action instead of a scheduled job.)
export async function POST(req: Request) {
  const parsed = CompleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { bookingId } = parsed.data;

  const authed = await supabaseServer();
  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // RLS-scoped read = ownership check
  const { data: owned } = await authed
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const { data: booking } = await db
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single<Booking>();
  if (!booking || booking.status !== "confirmed") {
    return NextResponse.json(
      { error: "Booking is not in a confirmed state" },
      { status: 409 },
    );
  }

  await db
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", bookingId);

  const { data: application } = await db
    .from("applications")
    .select("*")
    .eq("id", booking.application_id)
    .single<Application>();
  if (application) {
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
    if (opening && seeker) {
      await sendFeedbackPrompts({
        bookingId,
        seekerName: seeker.name,
        seekerPhone: seeker.phone,
        employerEmail: user.email,
        openingTitle: opening.title,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
