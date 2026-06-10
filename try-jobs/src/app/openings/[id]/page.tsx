import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import type { Opening } from "@/lib/types";
import { InterestForm } from "./InterestForm";

export const dynamic = "force-dynamic";

export default async function OpeningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
  const { data: opening } = await db
    .from("openings")
    .select("*")
    .eq("id", id)
    .eq("status", "open")
    .maybeSingle<Opening>();

  if (!opening) notFound();

  return (
    <>
      <div className="rise">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>{opening.title}</h1>
          <span className="rate-chip">
            ${Number(opening.hourly_rate).toFixed(2)}/h CAD
          </span>
        </div>
        <p className="meta">
          {opening.location} ·{" "}
          {new Date(opening.try_day_at).toLocaleString("en-CA", {
            dateStyle: "full",
            timeStyle: "short",
          })}
        </p>
        <ul className="tags">
          {opening.must_have_attributes.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>

      <ol className="steps">
        <li className="rise" style={{ "--delay": "0.08s" } as React.CSSProperties}>
          <strong>Leave your number</strong>
          Name and phone below — that&apos;s the whole application.
        </li>
        <li className="rise" style={{ "--delay": "0.16s" } as React.CSSProperties}>
          <strong>Take a 5-minute call</strong>
          Our screening assistant phones you (recorded, shared with the
          employer). Can&apos;t talk? Answer the same questions by text.
        </li>
        <li className="rise" style={{ "--delay": "0.24s" } as React.CSSProperties}>
          <strong>Work a paid try-day</strong>
          If the employer books you, the trial shift is paid — then you both
          decide if it&apos;s a fit.
        </li>
      </ol>

      <div
        className="card rise"
        style={{ "--delay": "0.3s", marginTop: "1.6rem" } as React.CSSProperties}
      >
        <h2>I&apos;m interested</h2>
        <InterestForm openingId={opening.id} />
      </div>
    </>
  );
}
