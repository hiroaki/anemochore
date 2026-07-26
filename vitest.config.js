// vitest.config.js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    onConsoleLog(log, type) {
      // Restrict console output during tests to avoid cluttering the test results
      // Only allow console logs of type "log" to be displayed
      if (type === "stderr") return false;
    },
  },
});

