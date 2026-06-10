import Anthropic from "@anthropic-ai/sdk";
import {
  analysisSchema,
  clampAnalysis,
  scoringRubric,
  type ScreeningAnalysis,
} from "@/lib/screening";
import type { SmsAnswer } from "@/lib/types";

let cached: Anthropic | null = null;

function client(): Anthropic {
  if (!cached) cached = new Anthropic();
  return cached;
}

// Scores an SMS-fallback screening with the same rubric (and the same
// fairness guardrail) the voice agent uses, so both channels are comparable.
export async function scoreSmsScreening(params: {
  opening: { title: string; must_have_attributes: string[] };
  answers: SmsAnswer[];
}): Promise<ScreeningAnalysis> {
  const { opening, answers } = params;

  const transcript = answers
    .map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`)
    .join("\n\n");

  const response = await client().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    system:
      scoringRubric(opening) +
      "\n\nThis screening was conducted over SMS text messages instead of a phone call. Apply the rubric to the written answers; never penalize spelling, texting shorthand, or brevity inherent to SMS.",
    messages: [
      {
        role: "user",
        content: `Screening Q&A over SMS:\n\n${transcript}\n\nReturn the analysis as JSON matching the schema.`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: analysisSchema(opening),
      },
    },
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Anthropic scoring returned no text block");
  }
  const analysis = clampAnalysis(JSON.parse(text.text));
  if (!analysis) throw new Error("Anthropic scoring returned invalid analysis");
  return analysis;
}
