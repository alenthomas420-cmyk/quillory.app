"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BookButton({
  applicationId,
  rate,
}: {
  applicationId: string;
  rate: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(4);

  async function book() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, hours }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.checkoutUrl) {
      setError(json.error ?? "Booking failed — try again");
      setBusy(false);
      return;
    }
    window.location.href = json.checkoutUrl;
  }

  return (
    <div className="row">
      <label style={{ display: "inline-grid" }}>
        Shift length (hours)
        <input
          type="number"
          min={1}
          max={12}
          step={0.5}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          style={{ width: "6rem" }}
        />
      </label>
      <button onClick={book} disabled={busy}>
        {busy
          ? "Setting up payment…"
          : `Book try-day — pay $${(rate * hours).toFixed(2)} CAD`}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function CompleteButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/bookings/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Could not mark complete");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <button className="secondary" onClick={complete} disabled={busy}>
        {busy ? "Sending…" : "Mark try-day complete"}
      </button>
      {error && <span className="error"> {error}</span>}
    </>
  );
}
