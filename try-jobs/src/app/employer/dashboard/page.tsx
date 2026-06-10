import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Employer, Opening } from "@/lib/types";

export const dynamic = "force-dynamic";

async function saveProfile(formData: FormData) {
  "use server";
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/login");

  await supabase.from("employers").upsert({
    id: user.id,
    email: user.email ?? "",
    name: String(formData.get("name") ?? "").trim(),
    business_name: String(formData.get("business_name") ?? "").trim(),
    location: String(formData.get("location") ?? "").trim(),
  });
  redirect("/employer/dashboard");
}

async function signOut() {
  "use server";
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/employer/login");
}

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/login");

  // First sign-in: make sure the employer row exists (id = auth uid).
  const { data: employer } = await supabase
    .from("employers")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Employer>();
  if (!employer) {
    await supabase
      .from("employers")
      .insert({ id: user.id, email: user.email ?? "" });
  }

  const { data: openings } = await supabase
    .from("openings")
    .select("*")
    .eq("employer_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Opening[]>();

  const profileIncomplete = !employer?.business_name;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Your openings</h1>
        <form action={signOut}>
          <button className="secondary" type="submit">
            Sign out
          </button>
        </form>
      </div>

      {profileIncomplete && (
        <div className="card lift rise">
          <h2>Finish your business profile</h2>
          <form className="stack" action={saveProfile}>
            <label>
              Your name
              <input name="name" defaultValue={employer?.name ?? ""} required />
            </label>
            <label>
              Business name
              <input
                name="business_name"
                defaultValue={employer?.business_name ?? ""}
                required
              />
            </label>
            <label>
              Location
              <input
                name="location"
                defaultValue={employer?.location ?? ""}
                placeholder="e.g. Whitehorse, YT"
                required
              />
            </label>
            <button type="submit">Save profile</button>
          </form>
        </div>
      )}

      <p>
        <Link className="btn" href="/employer/openings/new">
          Post a try-day opening
        </Link>
      </p>

      {(openings ?? []).length === 0 && (
        <div className="card lift rise">
          <p>
            Nothing posted yet. Your first opening takes under 3 minutes to
            create.
          </p>
        </div>
      )}

      {(openings ?? []).map((o) => (
        <div className="card lift rise" key={o.id}>
          <h2>
            <Link href={`/employer/openings/${o.id}`}>{o.title}</Link>
          </h2>
          <p className="meta">
            {o.status} · {o.location} ·{" "}
            {new Date(o.try_day_at).toLocaleString("en-CA", {
              dateStyle: "medium",
              timeStyle: "short",
            })}{" "}
            · ${Number(o.hourly_rate).toFixed(2)}/h
          </p>
          <p className="meta">
            <Link href={`/employer/openings/${o.id}`}>
              Review screened candidates →
            </Link>
          </p>
        </div>
      ))}
    </>
  );
}
