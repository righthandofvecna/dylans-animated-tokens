
export const MODULENAME = "dylans-animated-tokens";

export function early_isGM() {
	const level = game.data.users.find(u => u._id == game.data.userId).role;
	const gmLevel = CONST.USER_ROLES.ASSISTANT;
	return level >= gmLevel;
}

export function isTheGM() {
	return game.users.find(u=>u.active && u.isGM)?.id === game.user.id;
}

export function isGMOnline() {
	return game.users.some(u=>u.active && u.isGM);
}

export async function sleep(ms) {
	return new Promise((resolve)=>setTimeout(resolve, ms))
}

export function snapToGrid({ x, y }, grid) {
	return {
		x: Math.floor(x / grid.sizeX) * grid.sizeX,
		y: Math.floor(y / grid.sizeY) * grid.sizeY,
	}
}

function _norm_angle(a) {
  return a < 0 ? a + 360 : (a >= 360 ? a - 360 : a);
}

/**
 * 
 * @param {object} a the thing that has the rotation
 * @param {number} a.x
 * @param {number} a.y
 * @param {number} a.w
 * @param {number} a.h
 * @param {number} a.r
 * @param {object} b the thing we want to check for adjacency
 * @param {number} b.x
 * @param {number} b.y
 * @param {number} b.w
 * @param {number} b.h
 */
export function isFacing(a, b) {
	const direction = (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) - 90;
  return Math.floor(_norm_angle(direction + 22.5) / 8) == Math.floor(_norm_angle(a.r + 22.5) / 8);
}

export function tokenScene(token) {
	return token?.scene ?? token?.parent ?? game.scenes.active;
}


export function getUuidFromTableResult(result) {
	if (result.type === "pack") {
		return `Compendium.${result.documentCollection}.${result.documentId}`;
	}
	if (result.type === "document") {
		return `${result.documentCollection}.${result.documentId}`;
	}
	return null;
}

export function listenFilepickerChange(filepicker, onChange) {
	$(filepicker).on("change", "input[type='text']", function() {onChange(this.value)});
  // dumb workaround to listen on the filepicker button too
  $(filepicker).on("click", "button", function () {
    const filePicker = $(this).closest("file-picker")?.get(0)?.picker;
    if (!filePicker) return;
    filePicker.callback = ((callback)=>{
      return function () {
        if (callback) callback(...arguments);
        onChange(arguments[0]);
      }
    })(filePicker.callback);
  })
}


export function getCombatsForScene(scene) {
	const combats = game.combats.filter(c=>c?.active && c?.scene?.uuid === scene) ?? [];
	if (combats.length > 0) return combats;
	// PTR 2e automatically disconnects the combat from the scene, so let's check the participants' scene IDs instead
	return game.combats.filter(c=>c?.active && c?.combatants?.some(p=>p.scene === scene)) ?? [];
}
