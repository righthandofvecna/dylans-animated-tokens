import { MODULENAME } from "./utils.mjs";

export function register() {
  foundry.applications.handlebars.loadTemplates([
    `modules/${MODULENAME}/templates/token-settings.hbs`,
  ]);
}