import { MODULENAME } from "./utils.mjs";

function setStyle(wrapped, texture, glTexture) {
  if (!game.settings.get(MODULENAME, "avoidBlur") || texture.scaleMode === PIXI.SCALE_MODES.NEAREST || !texture?.resource?.src || texture.resource.src.endsWith(".svg")) {
    return wrapped(texture, glTexture);
  };
  return wrapped({
    ...texture,
    scaleMode: PIXI.SCALE_MODES.NEAREST,
  }, glTexture);
}


async function Video_cloneTexture(wrapped, ...args) {
  const vt = await wrapped(...args);
  if (vt?.baseTexture?._scaleMode == undefined || !game.settings.get(MODULENAME, "avoidBlur")) {
    return vt;
  }
  vt.baseTexture._scaleMode = PIXI.SCALE_MODES.NEAREST;
  return vt;
}


export function register() {
  libWrapper.register(MODULENAME, "PIXI.TextureSystem.prototype.setStyle", setStyle, "WRAPPER");
  libWrapper.register(MODULENAME, "game.video.cloneTexture", Video_cloneTexture, "WRAPPER");
};