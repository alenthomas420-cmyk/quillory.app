import { verifyFeedbackToken } from "@/lib/tokens";
import { FeedbackForm } from "./FeedbackForm";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyFeedbackToken(token);

  if (!payload) {
    return (
      <>
        <h1>Link expired</h1>
        <p className="lede">
          This feedback link is invalid or has expired. If you think that&apos;s
          a mistake, get in touch and we&apos;ll send a fresh one.
        </p>
      </>
    );
  }

  return (
    <>
      <h1>
        {payload.role === "employer"
          ? "How did the try-day go?"
          : "How was your try-day?"}
      </h1>
      <p className="lede">
        {payload.role === "employer"
          ? "Your answer also releases the candidate's try-day payment."
          : "Two quick questions — it helps keep employers honest."}
      </p>
      <div className="card">
        <FeedbackForm token={token} role={payload.role} />
      </div>
    </>
  );
}
