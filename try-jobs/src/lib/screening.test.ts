import { describe, expect, it } from "vitest";
import {
  FAIRNESS_GUARDRAIL,
  buildQuestions,
  clampAnalysis,
  scoringRubric,
  voiceAgentSystemPrompt,
} from "@/lib/screening";
import { normalizePhone } from "@/lib/phone";

const opening = {
  title: "Barista",
  must_have_attributes: [
    "comfortable on register",
    "weekend availability",
    "friendly with regulars",
  ],
};

describe("buildQuestions", () => {
  it("produces 3 fixed + one question per attribute, capped at 7", () => {
    expect(buildQuestions(opening)).toHaveLength(6);
    const many = {
      title: "x",
      must_have_attributes: ["a", "b", "c", "d", "e", "f"],
    };
    expect(buildQuestions(many)).toHaveLength(7);
  });

  it("references each attribute", () => {
    const qs = buildQuestions(opening).join("\n");
    for (const attr of opening.must_have_attributes) {
      expect(qs).toContain(attr);
    }
  });
});

describe("fairness guardrail (PRD §11.4)", () => {
  it("is embedded in the scoring rubric", () => {
    expect(scoringRubric(opening)).toContain(FAIRNESS_GUARDRAIL);
  });

  it("instructs the voice agent not to judge delivery", () => {
    const prompt = voiceAgentSystemPrompt(opening);
    expect(prompt.toLowerCase()).toContain("accents");
    expect(prompt.toLowerCase()).toContain("non-native english");
  });
});

describe("clampAnalysis", () => {
  it("accepts a valid analysis and clamps the score to 1-5", () => {
    const result = clampAnalysis({
      summary: "line1\nline2\nline3",
      attribute_notes: [{ attribute: "a", note: "n" }],
      fit_score: 9,
      justification: "because",
    });
    expect(result?.fit_score).toBe(5);
    expect(result?.attribute_notes).toHaveLength(1);
  });

  it("rejects malformed payloads", () => {
    expect(clampAnalysis(null)).toBeNull();
    expect(clampAnalysis("nope")).toBeNull();
    expect(clampAnalysis({ summary: 1, fit_score: "x" })).toBeNull();
  });

  it("drops malformed attribute notes instead of failing", () => {
    const result = clampAnalysis({
      summary: "s",
      attribute_notes: [{ attribute: "ok", note: "ok" }, { bad: true }, null],
      fit_score: 3,
      justification: "j",
    });
    expect(result?.attribute_notes).toEqual([{ attribute: "ok", note: "ok" }]);
  });
});

describe("normalizePhone", () => {
  it("handles Canadian formats", () => {
    expect(normalizePhone("(867) 555-0123")).toBe("+18675550123");
    expect(normalizePhone("867-555-0123")).toBe("+18675550123");
    expect(normalizePhone("1 867 555 0123")).toBe("+18675550123");
    expect(normalizePhone("+18675550123")).toBe("+18675550123");
  });

  it("rejects invalid numbers", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });
});
