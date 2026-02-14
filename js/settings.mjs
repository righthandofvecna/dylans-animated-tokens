import { MODULENAME } from "./utils.mjs";

export function register() {

  game.settings.register(MODULENAME, "avoidBlur", {
		name: "Avoid Blur",
		default: true,
		type: Boolean,
		scope: "world",
		requiresReload: true,
		config: true,
		hint: "Avoid blurring the canvas and tokens when they get scaled up."
	});

	game.settings.register(MODULENAME, "walkSpeed", {
		name: "Token Walk Speed",
		default: 4,
		type: new foundry.data.fields.NumberField({min: 1, step: 1}),
		scope: "world",
		requiresReload: false,
		config: true,
		hint: "The number of grid spaces per second that a token moves when walking."
	});

	game.settings.register(MODULENAME, "runSpeed", {
		name: "Token Run Speed",
		default: 8,
		type: new foundry.data.fields.NumberField({min: 1, step: 1}),
		scope: "world",
		requiresReload: false,
		config: true,
		hint: "The number of grid spaces per second that a token moves when running."
	});

	game.settings.register(MODULENAME, "runDistance", {
		name: "Token Run Distance",
		default: 5,
		type: new foundry.data.fields.NumberField({min: 1, step: 1}),
		scope: "world",
		requiresReload: false,
		config: true,
		hint: "How many grid spaces a token can move before it is considered to be running."
	});

	game.settings.register(MODULENAME, "playIdleAnimations", {
		name: "Play Idle Animations",
		default: false,
		type: Boolean,
		scope: "world",
		requiresReload: false,
		config: true,
		hint: "Whether or not to play idle animations for tokens. (currently plays the walking animation slowly)"
	});

	game.settings.register(MODULENAME, "idleAnimTime", {
		name: "Idle Animation Time",
		default: 600,
		type: new foundry.data.fields.NumberField({min: 1, step: 1}),
		scope: "world",
		requiresReload: false,
		config: true,
		hint: "How many miliseconds it takes to wrap through an idle animation."
	});

  game.settings.register(MODULENAME, "tokenCollision", {
		name: "Token Collisions",
		default: true,
		type: Boolean,
		scope: "world",
		requiresReload: true,
		config: true,
		hint: "Treat tokens as walls for the purpose of movement."
	});

	game.settings.register(MODULENAME, "tokenCollisionAllied", {
		name: "Token Collisions (Allied)",
		default: false,
		type: Boolean,
		scope: "world",
		requiresReload: true,
		config: true,
		hint: "Treat allied tokens as walls for the purpose of movement. Requires 'Token Collisions' to be enabled."
	});

	game.settings.register(MODULENAME, "tokenCollisionHidden", {
		name: "Token Collisions (Hidden)",
		default: false,
		type: Boolean,
		scope: "world",
		requiresReload: true,
		config: true,
		hint: "Treat hidden tokens as walls for the purpose of movement. Requires 'Token Collisions' to be enabled."
	});

	game.settings.register(MODULENAME, "enableFollow", {
		name: "Enable Token Following",
		default: true,
		type: Boolean,
		scope: "world",
		requiresReload: true,
		config: true,
		hint: "Allows players to mark tokens (defaulting to the 'L' key) as tokens to automatically follow when they move."
	});

	game.settings.register(MODULENAME, "allowTokenArtPastBounds", {
		name: "Allow Token Art Past Bounds",
		default: true,
		type: Boolean,
		scope: "world",
		requiresReload: false,
		config: true,
		hint: "Whether the positioning settings in the Token Config menu automatically extends the art above the grid space the token is standing on. This mainly has an effect for non-square tokens and scaled tokens."
	});
};
