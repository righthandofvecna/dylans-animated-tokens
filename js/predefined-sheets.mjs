import { MODULENAME } from "./utils.mjs";

export class PredefinedSheets {

  static #registeredModules = new Set([MODULENAME]);
  static #sheetSettingsFn = {};

  static getSheetSettings(src) {
    for (const gss of Object.values(PredefinedSheets.#sheetSettingsFn)) {
      let sheetSettings = gss?.(src);
      if (sheetSettings) return sheetSettings;
    }
    return undefined;
  }

  static hasSheetSettings(src) {
    return !!this.getSheetSettings(src);
  }

  static cleanSrc(src) {
    for (const moduleName of PredefinedSheets.#registeredModules) {
      if (src.startsWith(`modules/${moduleName}/img`)) return src;
    }
    for (const moduleName of PredefinedSheets.#registeredModules) {
      if (src.includes(`modules/${moduleName}/img`)) {
        return src.substring(src.indexOf(`modules/${moduleName}/img`));
      }
    }
    return src;
  }

  static registerModule(moduleName, getSheetSettings) {
    PredefinedSheets.#registeredModules.add(moduleName);
    PredefinedSheets.#sheetSettingsFn[moduleName] = getSheetSettings;
  }
}


export function register() {
  const MODULE = game.modules.get(MODULENAME);
  MODULE.api ??= {};
  MODULE.api.PredefinedSheets = PredefinedSheets;
}