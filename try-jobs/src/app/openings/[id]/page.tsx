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
      <h1>{opening.title}</h1>
      <p className="meta">
        {opening.location} ·{" "}
        {new Date(opening.try_day_at).toLocaleString("en-CA", {
          dateStyle: "full",
          timeStyle: "short",
        })}{" "}
        · ${Number(opening.hourly_rate).toFixed(2)}/h CAD
      </p>
      <ul className="tags">
        {opening.must_have_attributes.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>

      <div className="card">
        <h2>How it works</h2>
        <ol>
          <li>Leave your name and number below.</li>
          <li>
            Our screening assistant calls you for a friendly 5-minute chat
            (recorded and shared with the employer). Can&apos;t talk? You can
            answer the same questions by text instead.
          </li>
          <li>
            If the employer books you, you work one <strong>paid</strong>{" "}
            trial shift — then you both decide if it&apos;s a fit.
          </li>
        </ol>
      </div>

      <div className="card">
        <h2>I&apos;m interested</h2>
        <InterestForm openingId={opening.id} />
      </div>
    </>
  );
}
