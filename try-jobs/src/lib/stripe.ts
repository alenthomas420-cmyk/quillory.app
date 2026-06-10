import Stripe from "stripe";
import { appUrl, platformFeePercent, requireEnv } from "@/lib/env";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (!cached) cached = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return cached;
}

// MVP payment model (PRD §11.1 [Assumption]): the employer pays the full
// try-day amount to the platform via Stripe Checkout; the seeker payout
// (total minus platform fee) is made manually after feedback. Stripe Connect
// marketplace payouts are flagged as a follow-up decision.
export async function createBookingCheckout(params: {
  bookingId: string;
  openingTitle: string;
  seekerName: string;
  rate: number; // CAD per hour
  hours: number;
  employerEmail: string;
}): Promise<{ url: string; sessionId: string }> {
  const { bookingId, openingTitle, seekerName, rate, hours, employerEmail } =
    params;

  const totalCents = Math.round(rate * hours * 100);

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: employerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: totalCents,
          product_data: {
            name: `Try-day: ${openingTitle} — ${seekerName}`,
            description: `${hours}h at $${rate.toFixed(2)}/h CAD (includes ${platformFeePercent()}% platform fee withheld from payout)`,
          },
        },
      },
    ],
    metadata: { bookingId },
    success_url: `${appUrl()}/employer/dashboard?paid=1`,
    cancel_url: `${appUrl()}/employer/dashboard?paid=0`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id };
}

export function seekerPayoutCents(rate: number, hours: number): number {
  const total = Math.round(rate * hours * 100);
  return Math.round(total * (1 - platformFeePercent() / 100));
}
