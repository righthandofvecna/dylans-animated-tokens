
import { MODULENAME } from "./utils.mjs";



export function register() {
  const MODULE = game.modules.get(MODULENAME);
  MODULE.api ??= {};
  MODULE.api.getIndicators ??= (tokenDoc)=>[];
}