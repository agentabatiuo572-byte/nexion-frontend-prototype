import { defineStore } from "pinia";
import { ref } from "vue";

const STORAGE_KEY = "uvel-data-visibility-v1";

export const useDataVisibility = defineStore("data-visibility", () => {
  const hidden = ref(false);
  try {
    hidden.value = uni.getStorageSync(STORAGE_KEY) === true;
  } catch (error) {
    console.warn("[data-visibility] Could not read the local preference.", error);
  }

  function toggle() {
    hidden.value = !hidden.value;
    try {
      uni.setStorageSync(STORAGE_KEY, hidden.value);
    } catch (error) {
      // Keep the current display choice usable even when storage is unavailable.
      console.warn("[data-visibility] Could not save the local preference.", error);
    }
  }

  function mask(value: string | number): string {
    return hidden.value ? "••••" : String(value);
  }

  return { hidden, toggle, mask };
});
