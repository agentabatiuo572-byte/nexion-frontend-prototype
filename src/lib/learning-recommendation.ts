import type { LearningCourse } from "@/api/learning-api";

export function selectRecommendedCourse<T extends Pick<LearningCourse, "featured" | "completed"> & Partial<Pick<LearningCourse, "progress">>>(courses: readonly T[]): T | undefined {
  return courses.find(course => !course.completed && Number(course.progress) > 0 && Number(course.progress) < 100)
    ?? courses.find(course => course.featured && !course.completed)
    ?? courses.find(course => !course.completed);
}
