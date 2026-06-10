import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { appUrl } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Completes the magic-link flow. Supabase sends either a PKCE `code` or a
// `token_hash` depending on client config — handle both.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;

  const supabase = await supabaseServer();

  let errorMessage: string | null = null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    errorMessage = error?.message ?? null;
  } else {
    errorMessage = "Missing sign-in code";
  }

  if (errorMessage) {
    return NextResponse.redirect(
      `${appUrl()}/employer/login?error=${encodeURIComponent(errorMessage)}`,
    );
  }
  return NextResponse.redirect(`${appUrl()}/employer/dashboard`);
}
