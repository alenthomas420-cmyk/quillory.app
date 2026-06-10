import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Application, Booking, Opening, Seeker } from "@/lib/types";
import { BookButton, CompleteButton } from "./Actions";

export const dynamic = "force-dynamic";

export default async function OpeningCandidatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/login");

  const { data: opening } = await supabase
    .from("openings")
    .select("*")
    .eq("id", id)
    .eq("employer_id", user.id)
    .maybeSingle<Opening>();
  if (!opening) notFound();

  const { data: applications } = await supabase
    .from("applications")
    .select("*")
    .eq("opening_id", id)
    .order("fit_score", { ascending: false, nullsFirst: false })
    .returns<Application[]>();

  const apps = applications ?? [];
  const seekerIds = apps.map((a) => a.seeker_id);
  const appIds = apps.map((a) => a.id);

  const [{ data: seekers }, { data: bookings }] = await Promise.all([
    seekerIds.length
      ? supabase.from("seekers").select("*").in("id", seekerIds).returns<Seeker[]>()
      : Promise.resolve({ data: [] as Seeker[] }),
    appIds.length
      ? supabase
          .from("bookings")
          .select("*")
          .in("application_id", appIds)
          .returns<Booking[]>()
      : Promise.resolve({ data: [] as Booking[] }),
  ]);

  const seekerById = new Map((seekers ?? []).map((s) => [s.id, s]));
  const bookingByApp = new Map(
    (bookings ?? []).map((b) => [b.application_id, b]),
  );

  return (
    <>
      <h1>{opening.title} — candidates</h1>
      <p className="meta">
        Try-day{" "}
        {new Date(opening.try_day_at).toLocaleString("en-CA", {
          dateStyle: "full",
          timeStyle: "short",
        })}{" "}
        · ${Number(opening.hourly_rate).toFixed(2)}/h CAD
      </p>

      <div className="notice">
        <strong>About the score:</strong> the 1–5 fit score reflects
        job-relevant signal only — availability, experience, and your
        must-have attributes. The screener is instructed to ignore accent,
        fluency, grammar, and hesitation, so a low-polish answer with good
        substance scores the same as a fluent one.
      </div>

      {apps.length === 0 && (
        <div className="card">
          <p>No candidates yet. Share your opening to get the word out.</p>
        </div>
      )}

      {apps.map((a) => {
        const seeker = seekerById.get(a.seeker_id);
        const booking = bookingByApp.get(a.id);
        if (!seeker) return null;

        return (
          <div className="card" key={a.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>{seeker.name}</h2>
              {a.fit_score != null && (
                <span className="score" title="Fit score (1-5)">
                  {a.fit_score}
                </span>
              )}
            </div>
            <p className="meta">
              Screening: {a.screening_status}
              {seeker.earliest_availability &&
                ` · Available: ${seeker.earliest_availability}`}
              {booking?.payment_status === "paid" ||
              booking?.payment_status === "released"
                ? ` · Phone: ${seeker.phone}`
                : ""}
            </p>

            {a.summary && (
              <p style={{ whiteSpace: "pre-line" }}>{a.summary}</p>
            )}
            {a.score_justification && (
              <p className="meta">Why this score: {a.score_justification}</p>
            )}

            {a.attribute_notes.length > 0 && (
              <ul>
                {a.attribute_notes.map((n) => (
                  <li key={n.attribute}>
                    <strong>{n.attribute}:</strong> {n.note}
                  </li>
                ))}
              </ul>
            )}

            {a.recording_url && (
              <p>
                <audio controls src={a.recording_url} preload="none" />
              </p>
            )}

            {a.transcript && (
              <details>
                <summary>Transcript</summary>
                <pre className="transcript">{a.transcript}</pre>
              </details>
            )}

            {!booking && a.screening_status === "complete" && (
              <BookButton
                applicationId={a.id}
                rate={Number(opening.hourly_rate)}
              />
            )}

            {booking && (
              <p className="meta">
                Booking: {booking.status} · payment {booking.payment_status} ·{" "}
                {booking.hours}h at ${Number(booking.try_day_rate).toFixed(2)}
                /h
                {booking.status === "confirmed" && (
                  <>
                    {" "}
                    <CompleteButton bookingId={booking.id} />
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
