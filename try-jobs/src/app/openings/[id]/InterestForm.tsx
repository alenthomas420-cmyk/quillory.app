"use client";

import { useState } from "react";

export function InterestForm({ openingId }: { openingId: string }) {
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "submitting" }
    | { phase: "done"; channel: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState({ phase: "submitting" });

    const res = await fetch("/api/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        openingId,
        name: form.get("name"),
        phone: form.get("phone"),
        earliestAvailability: form.get("earliestAvailability") ?? "",
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState({
        phase: "error",
        message: json.error ?? "Something went wrong — please try again",
      });
      return;
    }
    setState({ phase: "done", channel: json.channel ?? "call" });
  }

  if (state.phase === "done") {
    return (
      <p className="success">
        {state.channel === "sms"
          ? "We couldn't start a call right now, so we've texted you the screening questions — answer them whenever you're ready."
          : "You're in! Expect a call from our screening assistant within a few minutes. If you miss it, we'll follow up by text."}
      </p>
    );
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <label>
        Your name
        <input name="name" required maxLength={120} autoComplete="name" />
      </label>
      <label>
        Phone number
        <input
          name="phone"
          type="tel"
          required
          placeholder="(867) 555-0123"
          autoComplete="tel"
        />
      </label>
      <label>
        Earliest availability (optional)
        <input
          name="earliestAvailability"
          maxLength={200}
          placeholder="e.g. weekday mornings from next week"
        />
      </label>
      {state.phase === "error" && <p className="error">{state.message}</p>}
      <button type="submit" disabled={state.phase === "submitting"}>
        {state.phase === "submitting" ? "Sending…" : "Call me for the screening"}
      </button>
      <p className="meta">
        By submitting you agree to receive a recorded screening call and SMS
        messages about this opening.
      </p>
    </form>
  );
}
