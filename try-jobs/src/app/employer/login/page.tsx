import { redirect } from "next/navigation";
import { appUrl } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function sendMagicLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/employer/login?error=Enter+your+email");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${appUrl()}/employer/auth/callback` },
  });
  if (error) {
    redirect(`/employer/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/employer/login?sent=1");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <>
      <h1>Employer sign in</h1>
      <p className="lede">
        No password — we email you a sign-in link. New here? The same link
        creates your account.
      </p>
      <div className="card rise">
        {sent ? (
          <p className="success">
            Check your inbox — your sign-in link is on its way.
          </p>
        ) : (
          <form className="stack" action={sendMagicLink}>
            <label>
              Work email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit">Email me a sign-in link</button>
          </form>
        )}
      </div>
    </>
  );
}
