import { describe, expect, it } from "vitest";
import {
  checkStudentInput,
  checkTrainerComment,
  effortLabel,
  hasUnreadTrainerComment,
  isEmptyStudentSide,
  isUnseenByTrainer,
  isUnseenPain,
  sessionFeedbackId,
  tidyComment,
  type SessionFeedback,
} from "./sessionFeedback";

const base: SessionFeedback = {
  studentId: "s1", trainerId: "t1", day: "2026-10-14", effort: 8, pain: false, studentComment: "",
  studentAt: 1000, studentSeenAt: null, trainerComment: "", trainerAt: null, trainerSeenAt: null,
};

describe("sessionFeedback", () => {
  it("builds the id the Rules check", () => {
    expect(sessionFeedbackId("s1", "2026-10-14")).toBe("s1_2026-10-14");
  });

  it("names the five efforts and the values between them", () => {
    expect(effortLabel(2)).toBe("Muito leve");
    expect(effortLabel(8)).toBe("Pesado");
    expect(effortLabel(10)).toBe("Máximo");
    expect(effortLabel(5)).toBe("Leve");
    expect(effortLabel(0)).toBe("Muito leve");
    expect(effortLabel(null)).toBeNull();
    expect(effortLabel(11)).toBeNull();
    expect(effortLabel(6.5)).toBeNull();
  });

  it("trims comments and refuses control characters and long text", () => {
    expect(tidyComment("  doeu o joelho \n depois ", 500)).toBe("doeu o joelho \n depois");
    expect(tidyComment("a\tb", 500)).toBeNull();
    expect(tidyComment("x".repeat(501), 500)).toBeNull();
    expect(tidyComment("x".repeat(500), 500)).toBe("x".repeat(500));
  });

  it("checks what the aluno sends", () => {
    expect(checkStudentInput({ effort: 6, comment: " ok " })).toEqual({ ok: true, effort: 6, comment: "ok" });
    expect(checkStudentInput({ effort: null, comment: "" })).toEqual({ ok: true, effort: null, comment: "" });
    expect(checkStudentInput({ effort: 11, comment: "" })).toEqual({ ok: false, problem: "effort" });
    expect(checkStudentInput({ effort: 3, comment: "x".repeat(501) })).toEqual({ ok: false, problem: "comment" });
  });

  it("caps the personal's comment at 1,000", () => {
    expect(checkTrainerComment(" bom treino ")).toBe("bom treino");
    expect(checkTrainerComment("x".repeat(1001))).toBeNull();
  });

  it("knows what the personal has not seen", () => {
    expect(isUnseenByTrainer(base)).toBe(true);
    expect(isUnseenByTrainer({ ...base, trainerSeenAt: 2000 })).toBe(false);
    expect(isUnseenByTrainer({ ...base, studentAt: null })).toBe(false);
    expect(isUnseenPain({ ...base, pain: true })).toBe(true);
    expect(isUnseenPain({ ...base, pain: true, trainerSeenAt: 2 })).toBe(false);
    expect(isUnseenPain(base)).toBe(false);
  });

  it("knows what the aluno has not read", () => {
    expect(hasUnreadTrainerComment({ ...base, trainerComment: "boa", trainerAt: 3000 })).toBe(true);
    expect(hasUnreadTrainerComment({ ...base, trainerComment: "boa", trainerAt: 3000, studentSeenAt: 4000 })).toBe(false);
    expect(hasUnreadTrainerComment({ ...base, trainerSeenAt: 3000 })).toBe(false);
  });

  it("recognises an empty answer", () => {
    expect(isEmptyStudentSide(null, false, "")).toBe(true);
    expect(isEmptyStudentSide(4, false, "")).toBe(false);
    expect(isEmptyStudentSide(null, true, "")).toBe(false);
  });
});

import { blankFeedback, feedbackKey, indexFeedback, withStudentSeen, withTrainerResponse } from "./sessionFeedback";

describe("sessionFeedback helpers", () => {
  const feedback: SessionFeedback = {
    studentId: "s1", trainerId: "t1", day: "2026-10-14", effort: 8, pain: false, studentComment: "", studentAt: 1,
    studentSeenAt: null, trainerComment: "", trainerAt: null, trainerSeenAt: null,
  };
  it("keys a session the way groupSessions does", () => {
    expect(feedbackKey("s1", "2026-10-14")).toBe("s1|2026-10-14");
    expect(indexFeedback([feedback]).get("s1|2026-10-14")).toBe(feedback);
  });
  it("applies the personal's response to what is on screen", () => {
    const seen = withTrainerResponse(feedback, { seen: true }, 50);
    expect(seen.trainerSeenAt).toBe(50);
    expect(seen.trainerComment).toBe("");
    const commented = withTrainerResponse(seen, { comment: "Boa!" }, 60);
    expect(commented).toMatchObject({ trainerSeenAt: 50, trainerComment: "Boa!", trainerAt: 60 });
    expect(withTrainerResponse(feedback, { comment: "" }, 70)).toEqual(feedback);
    expect(hasUnreadTrainerComment(commented)).toBe(true);
    expect(hasUnreadTrainerComment(withStudentSeen(commented, 90))).toBe(false);
  });
  it("starts from nothing for a session with no feedback", () => {
    const blank = blankFeedback("s1", "t1", "2026-10-14");
    expect(isUnseenByTrainer(blank)).toBe(false);
    expect(blank.pain).toBe(false);
  });
});
