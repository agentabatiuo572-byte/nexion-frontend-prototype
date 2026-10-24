import type { LearningCourse } from "@/api/learning-api";

export function selectRecommendedCourse<T extends Pick<LearningCourse, "featured" | "completed">>(courses: readonly T[]): T | undefined {
  return courses.find(course => course.featured && !course.completed)
    ?? courses.find(course => !course.completed);
}
