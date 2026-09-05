import { apiClient } from "./runtime";
import { createLearningApi } from "./learning-api";

export const learningApi = createLearningApi(apiClient);
