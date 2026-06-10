import { appUrl, requireEnv } from "@/lib/env";
import {
  MAX_CALL_MINUTES,
  analysisSchema,
  scoringRubric,
  voiceAgentSystemPrompt,
} from "@/lib/screening";
import type { Opening } from "@/lib/types";

const VAPI_BASE = "https://api.vapi.ai";

// Places the outbound screening call with a transient (per-call) assistant
// built from the opening's attributes. VAPI runs the conversation, records it,
// and posts an end-of-call report (transcript + summary + structured data) to
// our webhook, which writes everything back onto the application.
export async function startScreeningCall(params: {
  applicationId: string;
  seekerName: string;
  seekerPhone: string;
  opening: Pick<Opening, "title" | "must_have_attributes">;
}): Promise<{ callId: string }> {
  const { applicationId, seekerName, seekerPhone, opening } = params;

  const body = {
    phoneNumberId: requireEnv("VAPI_PHONE_NUMBER_ID"),
    customer: { number: seekerPhone, name: seekerName },
    metadata: { applicationId },
    assistant: {
      name: "Try Jobs Screener",
      firstMessage: `Hi ${seekerName}! I'm calling from Try Jobs about the ${opening.title} try-day you were interested in. This is a short screening call — do you have about five minutes?`,
      model: {
        provider: "anthropic",
        model: "claude-haiku-4-5",
        messages: [
          { role: "system", content: voiceAgentSystemPrompt(opening) },
        ],
      },
      maxDurationSeconds: MAX_CALL_MINUTES * 60 + 60,
      artifactPlan: { recordingEnabled: true },
      analysisPlan: {
        summaryPlan: {
          enabled: true,
          messages: [
            {
              role: "system",
              content: `${scoringRubric(opening)}\n\nReturn ONLY the 3-line summary as plain text.`,
            },
            {
              role: "user",
              content: "Transcript:\n\n{{transcript}}",
            },
          ],
        },
        structuredDataPlan: {
          enabled: true,
          schema: analysisSchema(opening),
          messages: [
            { role: "system", content: scoringRubric(opening) },
            {
              role: "user",
              content:
                "Transcript:\n\n{{transcript}}\n\nReturn the analysis as JSON matching the schema.",
            },
          ],
        },
      },
      server: {
        url: `${appUrl()}/api/webhooks/vapi`,
        secret: requireEnv("VAPI_WEBHOOK_SECRET"),
      },
    },
  };

  const res = await fetch(`${VAPI_BASE}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("VAPI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`VAPI call creation failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { id: string };
  return { callId: json.id };
}
