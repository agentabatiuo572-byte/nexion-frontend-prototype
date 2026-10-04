import { apiClient, expectedApiEnvironment } from "./runtime";
import { createLearningApi } from "./learning-api";

export const learningApi = createLearningApi(apiClient, expectedApiEnvironment);
