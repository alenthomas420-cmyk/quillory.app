import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreSmsScreening } from "@/lib/anthropic";
import { sendSms } from "@/lib/twilio";
import type { Application, Opening, Seeker, SmsAnswer } from "@/lib/types";

// SMS fallback (PRD §6): when the screening call fails or can't be placed,
// the same questions are asked one at a time over SMS so nobody is excluded
// by phone access. State lives on the application row
// (screening_questions / sms_question_index / sms_answers).

export async function startSmsScreening(
  db: SupabaseClient,
  application: Pick<Application, "id" | "screening_questions">,
  seeker: Pick<Seeker, "name" | "phone">,
  opening: Pick<Opening, "title">,
): Promise<void> {
  const questions = application.screening_questions;
  if (!questions.length) return;

  await db
    .from("applications")
    .update({ screening_status: "sms_in_progress", sms_question_index: 0 })
    .eq("id", application.id);

  await sendSms(
    seeker.phone,
    `Hi ${seeker.name}! We couldn't reach you by phone about the "${opening.title}" try-day, so let's do the short screening by text instead — ${questions.length} quick questions, answer in your own words.\n\nQ1: ${questions[0]}`,
  );
}

export async function handleSmsAnswer(
  db: SupabaseClient,
  application: Application,
  seeker: Pick<Seeker, "phone">,
  opening: Pick<Opening, "title" | "must_have_attributes">,
  answerText: string,
): Promise<void> {
  const questions = application.screening_questions;
  const index = application.sms_question_index;
  if (index >= questions.length) return;

  const answers: SmsAnswer[] = [
    ...application.sms_answers,
    { question: questions[index], answer: answerText.trim() },
  ];
  const nextIndex = index + 1;

  if (nextIndex < questions.length) {
    await db
      .from("applications")
      .update({ sms_answers: answers, sms_question_index: nextIndex })
      .eq("id", application.id);
    await sendSms(
      seeker.phone,
      `Q${nextIndex + 1}: ${questions[nextIndex]}`,
    );
    return;
  }

  // All questions answered — persist, then score with the shared rubric.
  await db
    .from("applications")
    .update({ sms_answers: answers, sms_question_index: nextIndex })
    .eq("id", application.id);

  try {
    const analysis = await scoreSmsScreening({ opening, answers });
    await db
      .from("applications")
      .update({
        screening_status: "complete",
        status: "screened",
        fit_score: analysis.fit_score,
        summary: analysis.summary,
        score_justification: analysis.justification,
        attribute_notes: analysis.attribute_notes,
        transcript: answers
          .map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`)
          .join("\n\n"),
      })
      .eq("id", application.id);
  } catch (err) {
    console.error("[smsScreening] scoring failed:", err);
    await db
      .from("applications")
      .update({ screening_status: "failed" })
      .eq("id", application.id);
  }

  await sendSms(
    seeker.phone,
    "That's everything — thanks! The employer will review your screening and reach out by text if they'd like to book a paid try-day with you.",
  );
}
