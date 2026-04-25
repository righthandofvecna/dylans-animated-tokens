
import { MODULENAME } from "./utils.mjs";
import * as socket from "./socket.mjs";


export async function RefreshTokenIndicators() {
  return socket.current().executeForEveryone("refreshTokenIndicators");
}


export function register() {
  const MODULE = game.modules.get(MODULENAME);
  MODULE.api ??= {};
  MODULE.api.getIndicators ??= async (tokenDoc)=>[];
  MODULE.api.isWater ??= (point)=>false;
  MODULE.api.getSurfboard ??= (tokenDoc) => `modules/${MODULENAME}/img/surfboard.json`;
  MODULE.api.RefreshTokenIndicators = RefreshTokenIndicators;

  socket.registerSocket("refreshTokenIndicators", async ()=>canvas?.tokens?.objects?.children?.forEach(t=>t._drawIndicators()));
  
  Hooks.callAll("dylans.animatedTokens.init");
  MODULE.initialized = true;
}