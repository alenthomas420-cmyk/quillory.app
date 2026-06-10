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
      <section className="hero rise">
        <div className="aurora" aria-hidden />
        <span className="eyebrow">Paid trial shifts · Yukon &amp; BC</span>
        <h1>
          Skip the resume.
          <br />
          Prove it on a <em>paid try-day</em>.
        </h1>
        <p className="lede">
          Pick a role, take a friendly 5-minute phone screening, and if
          it&apos;s a match you work one paid trial shift — then you and the
          employer both decide.
        </p>
        <div className="actions">
          <a className="btn" href="#openings">
            Browse open try-days
          </a>
          <Link className="btn secondary" href="/employer/dashboard">
            I&apos;m hiring
          </Link>
        </div>
        <div className="hero-stats">
          <span>
            <strong>5 min</strong> phone screening
          </span>
          <span>
            <strong>100%</strong> paid trial shifts
          </span>
          <span>
            <strong>0</strong> resumes required
          </span>
        </div>
      </section>

      <ol className="steps">
        <li className="rise" style={{ "--delay": "0.05s" } as React.CSSProperties}>
          <strong>Tap “I’m interested”</strong>
          Just your name and number — no account, no cover letter.
        </li>
        <li className="rise" style={{ "--delay": "0.15s" } as React.CSSProperties}>
          <strong>Take the call</strong>
          A patient screening assistant phones you. Can&apos;t talk? Answer by
          text instead.
        </li>
        <li className="rise" style={{ "--delay": "0.25s" } as React.CSSProperties}>
          <strong>Work a paid try-day</strong>
          Get booked, get paid for the shift, and see if it&apos;s a fit.
        </li>
      </ol>

      <div className="section-head" id="openings">
        <h2>Open try-days</h2>
        <span className="count">
          {openings.length} {openings.length === 1 ? "role" : "roles"} open
        </span>
      </div>

      {openings.length === 0 && (
        <div className="card">
          <p>No open try-days right now — check back soon.</p>
        </div>
      )}

      {openings.map((o, i) => (
        <div
          className="card lift rise"
          key={o.id}
          style={{ "--delay": `${0.1 + i * 0.08}s` } as React.CSSProperties}
        >
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>
              <Link href={`/openings/${o.id}`}>{o.title}</Link>
            </h2>
            <span className="rate-chip">
              ${Number(o.hourly_rate).toFixed(2)}/h CAD
            </span>
          </div>
          <p className="meta">
            {o.location} ·{" "}
            {new Date(o.try_day_at).toLocaleString("en-CA", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          <ul className="tags">
            {o.must_have_attributes.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p style={{ marginBottom: 0 }}>
            <Link className="btn" href={`/openings/${o.id}`}>
              I&apos;m interested
            </Link>
          </p>
        </div>
      ))}
    </>
  );
}
