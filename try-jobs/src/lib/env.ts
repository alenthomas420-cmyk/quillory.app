// Central place to read server-side configuration. Each integration reads its
// own keys lazily so the app can boot (and unrelated features keep working)
// when an integration is not configured yet.

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export function platformFeePercent(): number {
  const raw = Number(process.env.PLATFORM_FEE_PERCENT ?? "10");
  return Number.isFinite(raw) && raw >= 0 && raw < 100 ? raw : 10;
}
