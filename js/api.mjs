
import { MODULENAME } from "./utils.mjs";



export function register() {
  const MODULE = game.modules.get(MODULENAME);
  MODULE.api ??= {};
  MODULE.api.getIndicators ??= async (tokenDoc)=>[];
  MODULE.api.isWater ??= (point)=>false;
  MODULE.api.getSurfboard ??= (tokenDoc) => `modules/${MODULENAME}/img/surfboard.json`;


  Hooks.callAll("dylans.animatedTokens.init");
  MODULE.initialized = true;
}