import { createHmac, timingSafeEqual } from "crypto";

// Signed, expiring links let seekers (who have no account) and employers
// submit feedback from an SMS/email link without logging in.

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function secret(): string {
  const s = process.env.APP_SECRET;
  if (!s) throw new Error("Missing required environment variable: APP_SECRET");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export interface FeedbackTokenPayload {
  bookingId: string;
  role: "employer" | "seeker";
}

export function createFeedbackToken(
  payload: FeedbackTokenPayload,
  ttlMs: number = DEFAULT_TTL_MS,
  now: number = Date.now(),
): string {
  const exp = now + ttlMs;
  const body = `${payload.bookingId}.${payload.role}.${exp}`;
  return `${Buffer.from(body).toString("base64url")}.${sign(body)}`;
}

export function verifyFeedbackToken(
  token: string,
  now: number = Date.now(),
): FeedbackTokenPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encodedBody = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  let body: string;
  try {
    body = Buffer.from(encodedBody, "base64url").toString();
  } catch {
    return null;
  }

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const parts = body.split(".");
  if (parts.length !== 3) return null;
  const [bookingId, role, expRaw] = parts;
  const exp = Number(expRaw);
  if (!bookingId || (role !== "employer" && role !== "seeker")) return null;
  if (!Number.isFinite(exp) || exp < now) return null;

  return { bookingId, role };
}
