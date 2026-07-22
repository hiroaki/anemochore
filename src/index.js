import { createApp } from "./app.js";

export default {
  fetch(request, env, executionContext) {
    return createApp().fetch(request, env, executionContext);
  },
};
