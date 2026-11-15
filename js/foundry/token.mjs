import { NonPrivateTokenMixin as NonPrivateTokenMixinV14 } from "./token-v14.mjs";
import { NonPrivateTokenMixin as NonPrivateTokenMixinV14_369 } from "./token-v14.369.mjs";
import { NonPrivateTokenMixin as NonPrivateTokenMixinV14_363 } from "./token-v14.363.mjs";
import { NonPrivateTokenMixin as NonPrivateTokenMixinV13 } from "./token-v13.mjs";

export function NonPrivateTokenMixin(Base) {
  if (!foundry.utils.isNewerVersion(game.version, "14")) return class extends NonPrivateTokenMixinV13(Base) {};

  if (foundry.utils.isNewerVersion(game.version, "14.369")) return class extends NonPrivateTokenMixinV14(Base) {};
  if (foundry.utils.isNewerVersion(game.version, "14.363")) return class extends NonPrivateTokenMixinV14_369(Base) {};
  return class extends NonPrivateTokenMixinV14_363(Base) {};
}