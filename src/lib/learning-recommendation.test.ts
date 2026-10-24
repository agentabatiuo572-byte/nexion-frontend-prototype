import { expect, it } from "vitest";
import { selectRecommendedCourse } from "./learning-recommendation";

it("advances through unfinished featured courses, then ordinary courses in published order", () => {
  const courses = [
    { id: "ordinary-first", featured: false, completed: false },
    { id: "featured-first", featured: true, completed: false },
    { id: "featured-next", featured: true, completed: false },
    { id: "ordinary-next", featured: false, completed: false },
  ];
  for (const id of ["featured-first", "featured-next", "ordinary-first", "ordinary-next"]) {
    expect(selectRecommendedCourse(courses)?.id).toBe(id);
    courses.find(course => course.id === id)!.completed = true;
  }
  expect(selectRecommendedCourse(courses)).toBeUndefined();
  expect(selectRecommendedCourse([])).toBeUndefined();
  expect(courses.map(course => course.id)).toEqual(["ordinary-first", "featured-first", "featured-next", "ordinary-next"]);
});
