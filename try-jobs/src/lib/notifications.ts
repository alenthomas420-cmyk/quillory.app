import { appUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/twilio";
import { createFeedbackToken } from "@/lib/tokens";

// Notification failures must never roll back the business action that
// triggered them (booking, payment, …) — log and continue.
async function safely(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[notifications] ${label} failed:`, err);
  }
}

export async function sendBookingConfirmations(params: {
  seekerName: string;
  seekerPhone: string;
  employerEmail: string;
  businessName: string;
  openingTitle: string;
  location: string;
  scheduledAt: Date;
  rate: number;
}): Promise<void> {
  const when = params.scheduledAt.toLocaleString("en-CA", {
    dateStyle: "full",
    timeStyle: "short",
  });

  await Promise.all([
    safely("seeker booking SMS", () =>
      sendSms(
        params.seekerPhone,
        `Hi ${params.seekerName}! Your paid try-day for "${params.openingTitle}" at ${params.businessName} is confirmed: ${when}, ${params.location}. Rate: $${params.rate.toFixed(2)}/h CAD. Reply to this number if you have questions.`,
      ),
    ),
    safely("employer booking email", () =>
      sendEmail({
        to: params.employerEmail,
        subject: `Try-day confirmed: ${params.seekerName} — ${params.openingTitle}`,
        text: `Your try-day with ${params.seekerName} for "${params.openingTitle}" is confirmed.\n\nWhen: ${when}\nWhere: ${params.location}\nRate: $${params.rate.toFixed(2)}/h CAD (paid through Try Jobs)\n\nManage it from your dashboard: ${appUrl()}/employer/dashboard`,
      }),
    ),
  ]);
}

export async function sendFeedbackPrompts(params: {
  bookingId: string;
  seekerName: string;
  seekerPhone: string;
  employerEmail: string;
  openingTitle: string;
}): Promise<void> {
  const employerLink = `${appUrl()}/feedback/${createFeedbackToken({
    bookingId: params.bookingId,
    role: "employer",
  })}`;
  const seekerLink = `${appUrl()}/feedback/${createFeedbackToken({
    bookingId: params.bookingId,
    role: "seeker",
  })}`;

  await Promise.all([
    safely("seeker feedback SMS", () =>
      sendSms(
        params.seekerPhone,
        `Hi ${params.seekerName}! How did your try-day for "${params.openingTitle}" go? Tell us in 1 minute: ${seekerLink}`,
      ),
    ),
    safely("employer feedback email", () =>
      sendEmail({
        to: params.employerEmail,
        subject: `How did the try-day go? — ${params.openingTitle}`,
        text: `Your try-day with ${params.seekerName} is done.\n\nWould you hire them? Let us know (this also releases their payment): ${employerLink}`,
      }),
    ),
  ]);
}
