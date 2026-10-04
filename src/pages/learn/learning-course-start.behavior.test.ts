import { describe, expect, it, vi } from "vitest";
import type { LearningCourse } from "@/api/learning-api";
import { createLearningCourseStartLoadCoalescer, loadPublishedCourseWithStart } from "./learning-course-start";

const publishedCourse: LearningCourse = {
  id: "secure-basics",
  title: "Secure basics",
  body: "Published learning material remains readable.",
  category: "security",
  format: "article",
  level: "beginner",
  duration: "5m",
  rewardNex: "10",
  featured: false,
  version: "v1",
  progress: 0,
  completed: false,
  attempts: 0,
  lastScore: 0,
  rewardGranted: false,
  serverCanonical: true,
  source: "provider",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  permanentLabel: "PRODUCTION LEARNING FACTS",
  questions: [],
};

describe("published course start recovery", () => {
  it("publishes the GET course as locked pending content before a slow start settles", async () => {
    let resolveStart: ((value: LearningCourse) => void) | undefined;
    const visible: Array<{ course: LearningCourse; start: string }> = [];
    const pending = loadPublishedCourseWithStart({
      courseId: publishedCourse.id,
      language: "en",
      read: vi.fn().mockResolvedValue(publishedCourse),
      start: vi.fn().mockImplementation(() => new Promise<LearningCourse>((resolve) => { resolveStart = resolve; })),
      isCurrent: () => true,
      publish: (course, start) => visible.push({ course, start }),
    });

    await vi.waitFor(() => expect(visible).toEqual([{ course: publishedCourse, start: "pending" }]));
    resolveStart?.(publishedCourse);

    await expect(pending).resolves.toEqual({ kind: "content", course: publishedCourse, start: "confirmed" });
  });

  it("keeps a successfully read published course visible when its one start write fails", async () => {
    const read = vi.fn().mockResolvedValue(publishedCourse);
    const start = vi.fn().mockRejectedValue(new Error("START_WRITE_UNKNOWN"));

    const result = await loadPublishedCourseWithStart({
      courseId: publishedCourse.id,
      language: "en",
      read,
      start,
      isCurrent: () => true,
    });

    expect(result).toEqual({ kind: "content", course: publishedCourse, start: "unconfirmed" });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("does not send start after the published read becomes stale", async () => {
    let current = true;
    const read = vi.fn().mockImplementation(async () => {
      current = false;
      return publishedCourse;
    });
    const start = vi.fn().mockResolvedValue(publishedCourse);

    const result = await loadPublishedCourseWithStart({
      courseId: publishedCourse.id,
      language: "en",
      read,
      start,
      isCurrent: () => current,
    });

    expect(result).toEqual({ kind: "stale" });
    expect(start).not.toHaveBeenCalled();
  });

  it("does not acknowledge a start response for a different course version", async () => {
    const result = await loadPublishedCourseWithStart({
      courseId: publishedCourse.id,
      language: "en",
      read: vi.fn().mockResolvedValue(publishedCourse),
      start: vi.fn().mockResolvedValue({ ...publishedCourse, version: "v2" }),
      isCurrent: () => true,
    });

    expect(result).toEqual({ kind: "content", course: publishedCourse, start: "unconfirmed" });
  });

  it("refuses a mismatched GET id before it can start another course", async () => {
    const start = vi.fn().mockResolvedValue(publishedCourse);

    const result = await loadPublishedCourseWithStart({
      courseId: "requested-course",
      language: "en",
      read: vi.fn().mockResolvedValue({ ...publishedCourse, id: "wrong-course" }),
      start,
      isCurrent: () => true,
    });

    expect(result).toEqual({ kind: "invalid" });
    expect(start).not.toHaveBeenCalled();
  });

  it("coalesces two same-scope recovery activations into one start-bearing load", async () => {
    let resolveLoad: (() => void) | undefined;
    const underlying = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveLoad = resolve; }));
    const load = createLearningCourseStartLoadCoalescer(underlying);

    const first = load();
    const second = load();

    expect(first).toBe(second);
    expect(underlying).toHaveBeenCalledTimes(1);
    resolveLoad?.();
    await first;
  });
});
