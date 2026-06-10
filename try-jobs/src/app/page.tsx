import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import type { Opening } from "@/lib/types";

export const dynamic = "force-dynamic";

// Public board: anyone can browse open try-days (no account needed, PRD §5.2).
// Uses the anon key — RLS only exposes openings with status = 'open'.
async function fetchOpenings(): Promise<Opening[]> {
  const db = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
  const { data } = await db
    .from("openings")
    .select("*")
    .eq("status", "open")
    .order("try_day_at", { ascending: true });
  return (data as Opening[]) ?? [];
}

export default async function BoardPage() {
  const openings = await fetchOpenings();

  return (
    <>
      <h1>Open try-days</h1>
      <p className="lede">
        Pick a role, answer a 5-minute phone screening, and if it&apos;s a
        match you get a <strong>paid trial shift</strong> — no resume needed.
      </p>

      {openings.length === 0 && (
        <div className="card">
          <p>No open try-days right now — check back soon.</p>
        </div>
      )}

      {openings.map((o) => (
        <div className="card" key={o.id}>
          <h2>
            <Link href={`/openings/${o.id}`}>{o.title}</Link>
          </h2>
          <p className="meta">
            {o.location} ·{" "}
            {new Date(o.try_day_at).toLocaleString("en-CA", {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            · ${Number(o.hourly_rate).toFixed(2)}/h CAD
          </p>
          <ul className="tags">
            {o.must_have_attributes.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p>
            <Link className="btn" href={`/openings/${o.id}`}>
              I&apos;m interested
            </Link>
          </p>
        </div>
      ))}
    </>
  );
}
