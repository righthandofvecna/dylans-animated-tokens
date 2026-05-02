import { NonPrivateTokenMixin as NonPrivateTokenMixinV14 } from "./token-v14.mjs";
import { NonPrivateTokenMixin as NonPrivateTokenMixinV13 } from "./token-v13.mjs";

export function NonPrivateTokenMixin(Base) {
  const IS_V14 = foundry.utils.isNewerVersion(game.version, "14.351");
  const NonPrivateTokenMixin = IS_V14 ? NonPrivateTokenMixinV14 : NonPrivateTokenMixinV13;
  return class extends NonPrivateTokenMixin(Base) {};
}