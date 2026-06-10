import { beforeAll, describe, expect, it } from "vitest";
import { createFeedbackToken, verifyFeedbackToken } from "@/lib/tokens";

beforeAll(() => {
  process.env.APP_SECRET = "test-secret";
});

describe("feedback tokens", () => {
  it("round-trips a valid token", () => {
    const token = createFeedbackToken({ bookingId: "abc-123", role: "seeker" });
    expect(verifyFeedbackToken(token)).toEqual({
      bookingId: "abc-123",
      role: "seeker",
    });
  });

  it("rejects a tampered token", () => {
    const token = createFeedbackToken({
      bookingId: "abc-123",
      role: "seeker",
    });
    const [body] = token.split(".");
    const forgedBody = Buffer.from(
      Buffer.from(body, "base64url")
        .toString()
        .replace("seeker", "employer"),
    ).toString("base64url");
    const forged = `${forgedBody}.${token.split(".")[1]}`;
    expect(verifyFeedbackToken(forged)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createFeedbackToken(
      { bookingId: "abc-123", role: "employer" },
      1000,
      Date.now() - 10_000,
    );
    expect(verifyFeedbackToken(token)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyFeedbackToken("not-a-token")).toBeNull();
    expect(verifyFeedbackToken("")).toBeNull();
    expect(verifyFeedbackToken("a.b.c")).toBeNull();
  });
});
