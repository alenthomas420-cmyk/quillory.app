import type { Opening } from "@/lib/types";

// The screening interview structure and scoring rubric. This module is the
// single source of truth for both channels: the VAPI voice agent and the SMS
// fallback both use buildQuestions() and the fairness guardrail below
// (PRD §6 and §11.4).

export const MAX_CALL_MINUTES = 5;

// Fixed openers (PRD §6: first 2-3 questions are fixed).
const FIXED_QUESTIONS = [
  "What days and times are you generally available to work?",
  "Tell me about any experience you have that's relevant to this kind of work — paid or unpaid, anything counts.",
  "What made you interested in this role?",
];

// 5-7 questions total: 3 fixed + up to 4 generated from must-have attributes.
export function buildQuestions(opening: {
  title: string;
  must_have_attributes: string[];
}): string[] {
  const attributeQuestions = opening.must_have_attributes
    .slice(0, 4)
    .map(
      (attr) =>
        `One thing that matters for this role is being ${normalizeAttribute(attr)}. Can you tell me about a time you've done that, or how you'd approach it?`,
    );
  return [...FIXED_QUESTIONS, ...attributeQuestions];
}

function normalizeAttribute(attr: string): string {
  return attr.trim().replace(/\.+$/, "").toLowerCase();
}

// Fairness guardrail (PRD §6 + §11.4). Included verbatim in both the voice
// agent's analysis prompt and the SMS-fallback scoring prompt, and surfaced
// to employers in the review UI so the score is interpreted correctly.
export const FAIRNESS_GUARDRAIL = `Score ONLY job-relevant signal: availability, relevant experience, motivation, and coverage of the role's must-have attributes.
Do NOT consider — and do not let it influence the score in any way — the candidate's accent, English fluency, grammar, vocabulary, hesitation, pauses, filler words, speech disfluencies, or how polished their phrasing is. Many strong candidates are non-native speakers or have speech differences; a halting answer with good substance must score the same as a fluent answer with the same substance.
If an answer was unclear, judge only the content that was communicated, never the delivery.`;

export function scoringRubric(opening: {
  title: string;
  must_have_attributes: string[];
}): string {
  return `You are evaluating a screening interview for an hourly "${opening.title}" try-day role.

Must-have attributes for this role:
${opening.must_have_attributes.map((a) => `- ${a}`).join("\n")}

${FAIRNESS_GUARDRAIL}

Produce:
1. summary — exactly 3 short plain-language lines an employer can scan in seconds.
2. attribute_notes — for EACH must-have attribute, one sentence on whether the candidate showed evidence for it (or note "not covered").
3. fit_score — an integer 1-5 for job-relevant fit (1 = poor fit signal, 3 = some relevant signal, 5 = strong evidence on availability, experience and the must-have attributes).
4. justification — one sentence explaining the score, referencing only job-relevant evidence.`;
}

// System prompt for the VAPI voice agent itself (conversation behaviour).
export function voiceAgentSystemPrompt(opening: {
  title: string;
  must_have_attributes: string[];
}): string {
  const questions = buildQuestions(opening);
  return `You are a friendly, patient phone screener for a "${opening.title}" try-day shift (a short paid trial shift).

Rules of conduct:
- Start by introducing yourself briefly and confirming consent: "This short call is recorded and shared with the employer — is that okay?" If they decline, thank them and end the call politely.
- Be conversational and warm. Never rush the candidate.
- Be accommodating of accents, hesitation, and non-native English. Never comment on or judge how someone speaks — only what they say.
- Ask the questions below one at a time, in order. If an answer is unclear, re-ask ONCE in simpler words, then move on.
- Do not invent extra questions. Do not give hiring advice or discuss pay beyond what is listed.
- Keep the whole call under ${MAX_CALL_MINUTES} minutes. If time runs short, skip remaining attribute questions rather than rushing the candidate.
- Close by thanking them and saying the employer will review their screening and reach out by text message.

Questions to ask, in order:
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
}

// JSON schema for the structured analysis we want back (used by the VAPI
// analysis plan and by the Anthropic SMS-fallback scorer).
export function analysisSchema(opening: { must_have_attributes: string[] }) {
  return {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Exactly 3 short lines, separated by newlines.",
      },
      attribute_notes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            attribute: { type: "string" },
            note: { type: "string" },
          },
          required: ["attribute", "note"],
          additionalProperties: false,
        },
        description: `One entry per must-have attribute (${opening.must_have_attributes.length} total).`,
      },
      fit_score: {
        type: "integer",
        enum: [1, 2, 3, 4, 5],
      },
      justification: { type: "string" },
    },
    required: ["summary", "attribute_notes", "fit_score", "justification"],
    additionalProperties: false,
  } as const;
}

export interface ScreeningAnalysis {
  summary: string;
  attribute_notes: { attribute: string; note: string }[];
  fit_score: number;
  justification: string;
}

export function clampAnalysis(raw: unknown): ScreeningAnalysis | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const score = Number(o.fit_score);
  if (typeof o.summary !== "string" || !Number.isFinite(score)) return null;
  return {
    summary: o.summary,
    attribute_notes: Array.isArray(o.attribute_notes)
      ? (o.attribute_notes as { attribute: string; note: string }[]).filter(
          (n) => typeof n?.attribute === "string" && typeof n?.note === "string",
        )
      : [],
    fit_score: Math.min(5, Math.max(1, Math.round(score))),
    justification: typeof o.justification === "string" ? o.justification : "",
  };
}
