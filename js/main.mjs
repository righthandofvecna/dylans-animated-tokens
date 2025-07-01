
import * as migration from "./migration.mjs";
import * as settings from "./settings.mjs";
import * as token from "./token.mjs";
import * as spritesheets from "./spritesheets.mjs";
import * as pixelate from "./pixelate.mjs";
import * as canvas from "./canvas.mjs";

Hooks.on("init", ()=>{
  for (const m of [migration,
    settings,
    token,
    spritesheets,
    pixelate,
    canvas
  ]) {
    try {
      m.register();
    } catch (e) {
      console.error(`?.register():`, e);
    }
  }
})