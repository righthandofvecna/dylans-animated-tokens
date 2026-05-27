import { MODULENAME } from "./utils.mjs";

// ---------------------------------------------------------------------------
// Edit this section to list your other free modules and Patreon details.
// ---------------------------------------------------------------------------

/** @type {{ label: string, url: string, description: string }[]} */
const PROMO_MODULES = [
  {
    id: "dylans-general-automations",
    label: "Dylan's General Automations",
    url: "https://github.com/righthandofvecna/dylans-general-automations",
    description: "Support for general automations systems in Foundry VTT, such as tile scripts, collisions, new region behaviors, and more."
  },
  {
    id: "dylans-animated-tokens",
    label: "Dylan's Animated Tokens",
    url: "https://github.com/righthandofvecna/dylans-animated-tokens",
    description: "Support for spritesheet-based animated tokens and effects for Foundry VTT."
  },
  {
    id: "pokemon-assets",
    label: "Dylan's Pokémon Assets",
    url: "https://github.com/righthandofvecna/pokemon-assets",
    description: "A collection of free Pokémon-themed assets and behaviors for Foundry VTT, including animated tokens, Pokeball animations, cries, and more.",
    restriction: ()=>["ptu","ptr2e","pokerole"].includes(game.system.id) || !!game.modules.get("pokemon5e"),
  },
  {
    id: "dylans-dnd5e-automations",
    label: "Dylan's D&D 5e Automations (Patreon-Only)",
    url: "https://patreon.com/DylanIsSuperOK?utm_medium=foundry&utm_source=join_link&utm_campaign=creatorshare_creator&utm_content=copyLink",
    description: "Automations and quality-of-life improvements for D&D 5e in Foundry VTT.",
  }
];

const PATREON = {
  url: "https://patreon.com/DylanIsSuperOK?utm_medium=foundry&utm_source=join_link&utm_campaign=creatorshare_creator&utm_content=copyLink",
  description:
    "Support my free, open-source Foundry VTT modules and get access to development polls, previews of new features, and more!",
};

// ---------------------------------------------------------------------------

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const REQUIRED_SESSIONS = 3;
const EVERY_N_SESSIONS = 10;

export function register() {
  // Timestamp (ms) of the last session that was processed.
  game.settings.register(MODULENAME, "lastLogin", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
  });

  // Number of sessions that counted (i.e. started 8+ hours after the previous one).
  game.settings.register(MODULENAME, "qualifyingLogins", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
  });

  Hooks.once("ready", _onReady);
}

async function _onReady() {
  if (!game.user.isActiveGM) return;

  // if this module isn't the first active one in the cross promo list, don't show (we don't want multiple popups showing)
  if (PROMO_MODULES.filter(m => game.modules.get(m.id)?.active)?.at(0)?.id !== MODULENAME) return;

  // if all the modules are already installed, don't show
  if (PROMO_MODULES.every(m => !!game.modules.get(m.id))) return;

  // Don't interrupt a session where other users are already connected.
  if (game.users.filter((u) => u.active).length > 1) return;

  const now = Date.now();
  const lastLogin = game.settings.get(MODULENAME, "lastLogin");
  await game.settings.set(MODULENAME, "lastLogin", now);
  let count = game.settings.get(MODULENAME, "qualifyingLogins");

  // This session counts if it started at least 8 hours after the last tracked session
  // (also true on first ever run since lastLogin defaults to 0).
  if (now - lastLogin >= EIGHT_HOURS_MS) {
    count += 1;
    await game.settings.set(MODULENAME, "qualifyingLogins", count);
  } else {
    return;
  }


  if (count >= REQUIRED_SESSIONS && (count - REQUIRED_SESSIONS) % EVERY_N_SESSIONS === 0) {
    new CrossPromoApp().render({ force: true });
  }
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

class CrossPromoApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "dylans-cross-promo",
    classes: ["dylans-cross-promo"],
    window: {
      title: "More From Dylan",
      icon: "fa-solid fa-gift",
      resizable: false,
      minimizable: false,
    },
    position: {
      width: 460,
    },
    actions: {
      dismiss: CrossPromoApp.#dismiss,
    },
  };

  static PARTS = {
    content: {
      template: `modules/${MODULENAME}/templates/cross-promo.hbs`,
    },
  };

  async _prepareContext(_options) {
    const modules = PROMO_MODULES.filter(m => !game.modules.get(m.id) && (!m.restriction || m.restriction()));
    const MODULE = game.modules.get(MODULENAME);
    return {
      module: MODULE,
      modules: modules,
      hasModules: modules.length > 0,
      patreon: PATREON,
    };
  }

  /** @this {CrossPromoApp} */
  static async #dismiss(_event, _target) {
    await this.close();
  }
}
