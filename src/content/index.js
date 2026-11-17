import { PageController } from "./controller.js";

// Registered scripts and a popup-triggered injection can reach the same tab.
if (!globalThis.__gitlabCirillic) {
  globalThis.__gitlabCirillic = new PageController(window, browser);
  globalThis.__gitlabCirillic
    .start()
    .catch((error) => console.error("[GitLab Cirillic]", error.message));
}
