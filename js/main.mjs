
import * as migration from "./migration.mjs";
import * as settings from "./settings.mjs";
import * as tokensLayer from "./tokens-layer.mjs";
import * as token from "./token.mjs";
import * as tokenMovement from "./token-movement.mjs";
import * as spritesheets from "./spritesheets.mjs";
import * as pixelate from "./pixelate.mjs";
import * as canvas from "./canvas.mjs";
import * as moduleCompatibility from "./module-compatibility/index.mjs";

Hooks.on("init", ()=>{
  for (const m of [migration,
    settings,
    tokensLayer,
    token,
    tokenMovement,
    spritesheets,
    pixelate,
    canvas,
    moduleCompatibility,
  ]) {
    try {
      m.register();
    } catch (e) {
      console.error(`?.register():`, e);
    }
  }
})