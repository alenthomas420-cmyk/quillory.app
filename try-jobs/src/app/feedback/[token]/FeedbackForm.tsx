"use client";

import { useState } from "react";

const OUTCOMES = [
  { value: "would_hire", label: "Would hire" },
  { value: "would_not_hire", label: "Would not hire" },
  { value: "undecided", label: "Undecided" },
] as const;

export function FeedbackForm({
  token,
  role,
}: {
  token: string;
  role: "employer" | "seeker";
}) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<
    "idle" | "submitting" | "done" | string
  >("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        outcome: role === "employer" ? outcome : undefined,
        rating: rating ?? undefined,
        notes,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setState(json.error ?? "Something went wrong — try again");
      return;
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <p className="success">
        Thanks — your feedback is in.
        {role === "employer" && " The candidate's payment has been released."}
      </p>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      {role === "employer" && (
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend>Would you hire this candidate?</legend>
          <div className="row">
            {OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                className={outcome === o.value ? "" : "secondary"}
                onClick={() => setOutcome(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label>
        {role === "employer"
          ? "Rate the candidate's shift (1-5)"
          : "Rate the experience (1-5)"}
        <div className="row">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={rating === n ? "" : "secondary"}
              onClick={() => setRating(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </label>

      <label>
        Anything else? (optional)
        <textarea
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      {state !== "idle" && state !== "submitting" && (
        <p className="error">{state}</p>
      )}

      <button
        type="submit"
        disabled={
          state === "submitting" || (role === "employer" && !outcome)
        }
      >
        {state === "submitting" ? "Sending…" : "Submit feedback"}
      </button>
    </form>
  );
}
