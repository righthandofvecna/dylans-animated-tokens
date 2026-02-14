
import * as migration from "./migration.mjs";
import * as settings from "./settings.mjs";
import * as tokensLayer from "./tokens-layer.mjs";
import * as token from "./token.mjs";
import * as tokenConfig from "./token-config.mjs";
import * as tokenMovement from "./token-movement.mjs";
import * as spritesheets from "./spritesheets.mjs";
import * as pixelate from "./pixelate.mjs";
import * as canvas from "./canvas.mjs";
import * as moduleCompatibility from "./module-compatibility/index.mjs";

Hooks.on("init", ()=>{
  for (const [name, m] of [
    ["migration", migration],
    ["settings", settings],
    ["tokensLayer", tokensLayer],
    ["token", token],
    ["tokenConfig", tokenConfig],
    ["tokenMovement", tokenMovement],
    ["spritesheets", spritesheets],
    ["pixelate", pixelate],
    ["canvas", canvas],
    ["moduleCompatibility", moduleCompatibility],
  ]) {
    try {
      m.register();
    } catch (e) {
      console.error(`${name}.register():`, e);
    }
  }
})