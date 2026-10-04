import type { LearningCourse, LearningQuizReceipt, LearningQuizReceiptStatus, LearningResult } from "@/api/learning-api";

export interface LearningResultDetails {
  passed: boolean;
  score: number;
  attempts: number;
  rewardGranted: boolean;
  rewardNex: string | number;
}

/**
 * Prefer the exact response from the latest submit/receipt. After a reload,
 * fall back only to the canonical progress fields returned by the course API.
 */
export function learningResultDetails(
  course: LearningCourse | null,
  result: LearningResult | null,
): LearningResultDetails | null {
  if (result) {
    return {
      passed: result.passed,
      score: result.score,
      attempts: result.attempts,
      rewardGranted: result.rewardGranted,
      // A failed result carries rewardNex=0 because nothing was paid. Keep the
      // course's configured reward so the UI says “not granted” rather than
      // incorrectly claiming that the course has no reward.
      rewardNex: result.rewardGranted ? result.rewardNex : (course?.rewardNex ?? result.rewardNex),
    };
  }
  if (!course || (!course.completed && course.attempts === 0)) return null;
  return {
    passed: course.completed,
    score: course.lastScore,
    attempts: course.attempts,
    rewardGranted: course.rewardGranted,
    rewardNex: course.rewardNex,
  };
}

export function matchingReceiptResult(
  course: LearningCourse,
  receipt: LearningQuizReceipt,
): LearningResult | null {
  const result = receipt.result;
  if (!receipt.committed || !result) return null;
  return matchingCourseResult(course, result);
}

export function matchingCourseResult(
  course: LearningCourse,
  result: LearningResult,
): LearningResult | null {
  if (result.courseId !== course.id || result.version !== course.version) return null;
  return result;
}

export function validAnswersForCourse(course: LearningCourse, answers: number[] | null): boolean {
  return Array.isArray(answers)
    && answers.length === course.questions.length
    && answers.every((answer, index) => Number.isSafeInteger(answer)
      && answer >= 0
      && answer < course.questions[index].options.length);
}

export type LearningAttemptRecoveryAction = "RESTORE" | "REPLAY" | "RETIRE" | "HOLD";

export function learningAttemptRecoveryAction(
  pending: { key: string; answers: readonly number[] | null },
  status: LearningQuizReceiptStatus,
): LearningAttemptRecoveryAction {
  if (status === "COMMITTED") return "RESTORE";
  if (status === "PENDING" || status === "UNKNOWN") return "HOLD";
  return pending.answers ? "REPLAY" : "RETIRE";
}
