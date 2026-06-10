import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function createOpening(formData: FormData) {
  "use server";
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/login");

  const attributes = String(formData.get("attributes") ?? "")
    .split("\n")
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 5);

  const title = String(formData.get("title") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const tryDayAt = String(formData.get("try_day_at") ?? "");
  const hourlyRate = Number(formData.get("hourly_rate"));

  if (
    !title ||
    !location ||
    !tryDayAt ||
    !Number.isFinite(hourlyRate) ||
    hourlyRate <= 0 ||
    attributes.length < 3
  ) {
    redirect(
      "/employer/openings/new?error=" +
        encodeURIComponent(
          "Fill in every field and list at least 3 must-have attributes (one per line).",
        ),
    );
  }

  const { error } = await supabase.from("openings").insert({
    employer_id: user.id,
    title,
    location,
    try_day_at: new Date(tryDayAt).toISOString(),
    hourly_rate: hourlyRate,
    must_have_attributes: attributes,
  });
  if (error) {
    redirect(
      "/employer/openings/new?error=" + encodeURIComponent(error.message),
    );
  }
  redirect("/employer/dashboard");
}

export default async function NewOpeningPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <>
      <h1>Post a try-day opening</h1>
      <p className="lede">
        Candidates are screened by a short recorded phone interview built from
        your must-have attributes — you only review people who already answered
        the questions that matter to you.
      </p>
      <div className="card rise">
        <form className="stack" action={createOpening}>
          <label>
            Role title
            <input name="title" required placeholder="e.g. Barista" />
          </label>
          <label>
            Location
            <input
              name="location"
              required
              placeholder="e.g. Main St, Whitehorse, YT"
            />
          </label>
          <label>
            Try-day date &amp; start time
            <input name="try_day_at" type="datetime-local" required />
          </label>
          <label>
            Hourly try-day rate (CAD)
            <input
              name="hourly_rate"
              type="number"
              min="1"
              step="0.25"
              required
              placeholder="20.00"
            />
          </label>
          <label>
            Must-have attributes — 3 to 5, one per line
            <textarea
              name="attributes"
              rows={5}
              required
              placeholder={
                "comfortable on register\nweekend availability\nfriendly with regulars"
              }
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Publish opening</button>
        </form>
      </div>
    </>
  );
}
