import { MODULENAME, isTheGM, isGMOnline, early_isGM, tokenScene, getCombatsForScene } from "../utils.mjs";
import * as socket from "../socket.mjs";

const FLAG_FOLLOWING = "following";

function getFollowMap(scene) {
  const followMap = {};
  const allSceneTokens = scene?.tokens;
  if (!allSceneTokens) return {};
  
  for (const t of allSceneTokens) {
    const following = t.getFlag(MODULENAME, FLAG_FOLLOWING)?.who;
    if (!following) continue;
    followMap[following] ??= [];
    followMap[following].push(t.id);
  }
  return followMap;
}

/**
 * Get the chain of following tokens beginning at the provided token.
 * @param {*} token 
 * @returns 
 */
export function getAllFollowing(token) {
  const scene = tokenScene(token);
  const allSceneTokens = scene?.tokens;
  const followMap = getFollowMap(scene);
  const followerIds = [];
  const addFollower = function (fid) {
    followMap[fid]?.forEach(sfid=>{
      if (followerIds.includes(sfid)) {
        return;
      }
      followerIds.push(sfid);
      addFollower(sfid);
    });
  };
  addFollower(token.id);
  return followerIds.map(fid=>allSceneTokens.get(fid));
}


/**
 * Get the chain of following tokens which the given token is a part of.
 * This includes the token itself and all tokens that are following it, or that it is following, directly or indirectly.
 * @param {*} token 
 * @returns 
 */
export function getAllInFollowChain(token) {
  const followers = getAllFollowing(token);
  const scene = tokenScene(token);
  
  const followChain = new Set();
  const addToChain = (doc) => {
    if (!doc || followChain.has(doc)) return;
    followChain.add(doc);
    const following = doc.getFlag(MODULENAME, FLAG_FOLLOWING)?.who;
    if (following) {
      addToChain(scene?.tokens?.get(following));
    }
  };

  addToChain(token);
  followers.forEach(addToChain);
  
  return followChain;
}

function getFollowerUpdates(leaderToken, movement, followers) {
  if (!movement) return [];
  const followerUpdates = [];

  for (const follower of followers) {
    const desc = foundry.utils.deepClone(follower.getFlag(MODULENAME, FLAG_FOLLOWING));
    const leaderMovement = foundry.utils.deepClone(movement[leaderToken.id]);
    if (!leaderMovement) break; // leader didn't move, so we stop here
    leaderMovement.waypoints.unshift({
      ...leaderMovement.waypoints.at(0),
      x: leaderToken.x,
      y: leaderToken.y,
    });
    const wp = leaderMovement.waypoints.pop();
    const myMovement = movement[follower.id] = {
      ...foundry.utils.deepClone(leaderMovement),
      waypoints: leaderMovement.waypoints,
    };
    const oldPosition = myMovement.waypoints.at(-1);
    const stayBehind = canvas.grid.size; // how far behind the leader we want to stay
    let dx = wp.x - oldPosition.x;
    let dy = wp.y - oldPosition.y;
    dx = Math.sign(dx) * Math.max(0, Math.abs(dx) - stayBehind);
    dy = Math.sign(dy) * Math.max(0, Math.abs(dy) - stayBehind);
    let new_pos = { x: oldPosition.x + dx, y: oldPosition.y + dy };
    // Snap the new position to the grid
    new_pos = canvas.grid.getSnappedPoint( new_pos, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_VERTEX } );
    if (new_pos.x !== oldPosition.x || new_pos.y !== oldPosition.y) {
      // Only add new_pos if it is different from the last waypoint
      myMovement.waypoints.push({
        ...wp,
        ...new_pos,
      });
    }
    myMovement.method = "api";

    followerUpdates.push({
      _id: follower.id,
      x: myMovement.waypoints.at(-1).x,
      y: myMovement.waypoints.at(-1).y,
      [`flags.${MODULENAME}.${FLAG_FOLLOWING}`]: desc,
    });
    leaderToken = follower; // update leader for the next follower
  }
  return followerUpdates;
}

/**
 * Allow following tokens to teleport along with the leader token.
 * @param {*} wrapped 
 * @param {*} event 
 */
async function TeleportTokenRegionBehaviorType_tokenMoveIn(wrapped, event) {
  if ( !this.destination || event.data.movement.passed.waypoints.at(-1).action === "displace" ) return;
  const destination = fromUuidSync(this.destination);
  if ( !(destination instanceof RegionDocument) ) {
    console.error(`${this.destination} does not exist`);
    return;
  }

  const token = event.data.token;
  // if the token is following something, skip
  if (token.getFlag(MODULENAME, FLAG_FOLLOWING)?.who) return;
  const followers = getAllFollowing(token);

  // check if we currently have the token selected
  const selected = canvas.tokens.controlled.find(t=>t.document.id === token.id) !== null;

  // figure out if we're about to switch scenes
  const newScene = (await fromUuid(this.destination))?.parent ?? tokenScene(token);
  const switchScene = newScene?.id !== tokenScene(token)?.id;
  if (switchScene) {
    await token.update({[`flags.${MODULENAME}.${FLAG_FOLLOWING}.originalid`]: token.id});
  };

  //
  // Do the core teleportation logic
  //
  const shouldTeleport = await wrapped(event);
  if (shouldTeleport === false) return false;
  
  // Figure out what the new token is
  let newToken = token;
  if (switchScene) {
    newToken = newScene.tokens.find(t=>t.getFlag(MODULENAME, FLAG_FOLLOWING)?.originalid == token.id);
    if (!newToken) {
      ui.notifications.warn("Teleporting token not found in new scene");
      return;
    }
  }

  // teleport the followers
  if (followers.length > 0) {
    await TeleportFollowers(followers.map(follower=>follower.uuid), {x: newToken.x, y: newToken.y}, newScene.id, token.id, newToken.id);
  }

  // select the token now if it was selected before
  if (switchScene && selected) {
    newToken?.object?.control(true, { releaseOthers: false });
  }
}


async function TeleportTokenRegionBehaviorType_tokenPreMove(wrapped, event) {
  const token = event.data.token;
  if (token.getFlag(MODULENAME, FLAG_FOLLOWING)?.who) return;
  return wrapped(event);
}

/**
 * Teleports all followers of a token to the new destination, possibly across scenes.
 * @param {*} followerIds 
 * @param {*} destination 
 * @param {*} sceneId 
 * @returns 
 */
async function TeleportFollowers(followerIds, destination, sceneId) {
  if (!isTheGM() && isGMOnline()) {
    const soc = socket.current();
    if (!soc) return;
    return soc.executeAsGM("TeleportFollowers", followerIds, destination, sceneId);
  }
  const scene = game.scenes.get(sceneId);
  if (!scene) return;
  const followers = await Promise.all(followerIds.map(uuid=>fromUuid(uuid)));
  const sameSceneUpdates = [];
  const crossSceneCreates = [];
  const crossSceneDeletes = {};

  for (const follower of followers) {
    const followerScene = tokenScene(follower);
    if (followerScene.id === sceneId) {
      sameSceneUpdates.push({
        _id: follower.id,
        x: destination.x,
        y: destination.y,
        [`flags.${MODULENAME}.${FLAG_FOLLOWING}.positions`]: [{x: destination.x, y: destination.y}],
      });
    } else {
      crossSceneCreates.push({
        ...follower.toObject(),
        x: destination.x,
        y: destination.y,
        [`flags.${MODULENAME}.${FLAG_FOLLOWING}.positions`]: [{x: destination.x, y: destination.y}],
        [`flags.${MODULENAME}.${FLAG_FOLLOWING}.originalid`]: follower.id,
      });
      crossSceneDeletes[followerScene.id] ??= [];
      crossSceneDeletes[followerScene.id].push(follower.id);
    }
  }
  await scene.updateEmbeddedDocuments("Token", sameSceneUpdates, { follower_updates: [], forced: true, teleport: true });
  if (crossSceneCreates.length == 0) return; // we don't appear to have switched scenes

  await scene.createEmbeddedDocuments("Token", crossSceneCreates, { follower_updates: [], teleport: true });
  await Promise.all(Object.entries(crossSceneDeletes).map(([sceneId, ids])=>{
    const scene = game.scenes.get(sceneId);
    if (!scene) return;
    const tokens = ids.map(id=>scene.tokens.get(id));
    return scene.deleteEmbeddedDocuments("Token", tokens.map(t=>t.id), { teleport: true });
  }));

  // figure out what the mapping from old ids to new ids is
  const idMap = {};
  for (const token of scene.tokens) {
    if (token.getFlag(MODULENAME, FLAG_FOLLOWING)?.originalid) {
      idMap[token.getFlag(MODULENAME, FLAG_FOLLOWING).originalid] = token.id;
    }
  };
  if (Object.keys(idMap).length === 0) return;
  
  const newSceneIdUpdates = {};

  // update the following IDs to match the new ones
  for (const token of scene.tokens) {
    const following = token.getFlag(MODULENAME, FLAG_FOLLOWING)?.who;
    if (following && idMap[following] && idMap[following] !== following) {
      newSceneIdUpdates[token.id] = {
        _id: token.id,
        [`flags.${MODULENAME}.${FLAG_FOLLOWING}.who`]: idMap[following],
      };
    }
  };
  
  // remove the originalid flag
  for (const token of scene.tokens) {
    const originalId = token.getFlag(MODULENAME, FLAG_FOLLOWING)?.originalid;
    if (originalId) {
      newSceneIdUpdates[token.id] ??= { _id: token.id };
      newSceneIdUpdates[token.id][`flags.${MODULENAME}.${FLAG_FOLLOWING}.originalid`] = null;
    }
  }

  await scene.updateEmbeddedDocuments("Token", Object.values(newSceneIdUpdates), { follower_updates: [] });
}


/**
 * Begins or ends following a token.
 */
function OnFollowKey() {
  const allTokens = canvas?.tokens;
  let leader = canvas?.tokens?.hover?.id;
  const followers = (canvas?.tokens?.controlled ?? []).map(t=>t.id);

  if (!leader || followers.length === 0) return;

  const followMap = getFollowMap(canvas.scene);

  const updatesById = {};

  // find the tail
  let cycleDetected = false;

  // Initialize structures to track line order and visited IDs
  const visited = new Set();

  // Build a reverse mapping for incoming connections
  const reverseRecord = {};
  for (const [id, followers] of Object.entries(followMap)) {
    for (const follower of followers) {
      if (!reverseRecord[follower]) {
        reverseRecord[follower] = [];
      }
      reverseRecord[follower].push(id);
    }
  }

  function _traverseReverse(id) {
    if (cycleDetected || visited.has(id)) {
      cycleDetected = true;
      return []; // Avoid revisiting
    }
    visited.add(id);            // Mark as visited
    const lineOrder = [];
    // Explore incoming connections
    for (const followerOf of reverseRecord[id] || []) {
      lineOrder.push(..._traverseReverse(followerOf));
    }
    lineOrder.push(id);
    return lineOrder
  }

  function _traverseForwards(id) {
    if (cycleDetected || visited.has(id)) {
      cycleDetected = true;
      return []; // Avoid revisiting
    }
    visited.add(id);            // Mark as visited
    const lineOrder = [id];
    // Explore outgoing connections
    for (const follower of followMap[id] || []) {
      lineOrder.push(..._traverseForwards(follower));
    }
    return lineOrder;
  }

  // Recursive function to traverse connections in both directions
  function traverse(id) {
    if (cycleDetected || visited.has(id)) {
      cycleDetected = true;
      return []; // Avoid revisiting
    }
    visited.add(id);            // Mark as visited
    const lineOrder = [];
    // Explore incoming connections
    for (const followerOf of reverseRecord[id] || []) {
      lineOrder.push(..._traverseReverse(followerOf));
    }
    lineOrder.push(id);
    // Explore outgoing connections
    for (const follower of followMap[id] || []) {
      lineOrder.push(..._traverseForwards(follower));
    }
    return lineOrder;
  }

  // Start traversal from the given startID
  const lineOrder = traverse(leader);
  leader = lineOrder[lineOrder.length - 1];

  if (cycleDetected) {
    ui.notifications.error("A cycle is detected!!");
    Object.entries(followMap).flatMap(([_id, v])=>[_id, ...v]).forEach(_id=>{
      updatesById[_id] = {
        [`flags.${MODULENAME}.${FLAG_FOLLOWING}.who`]: null,
      };
    });
  }
  else {
    for (const follower of followers) {
      const leaderToken = allTokens.get(leader);
      const followerToken = allTokens.get(follower);
      if (!leaderToken || !followerToken) return;
      if (lineOrder.includes(follower) && followerToken.document.getFlag(MODULENAME, FLAG_FOLLOWING)?.who) {
        const lastLeaderToken = allTokens.get(lineOrder[lineOrder.findIndex((_id)=>_id === follower)-1]);
        canvas.interface.createScrollingText(followerToken, `Unfollowing ${lastLeaderToken?.document?.name ?? "someone"}!`, {
          anchor: CONST.TEXT_ANCHOR_POINTS.TOP, 
          fill:   "#FFFFFF", 
          stroke: "#FFFFFF"
        });
        updatesById[follower] ??= {};
        updatesById[follower][`flags.${MODULENAME}.${FLAG_FOLLOWING}.==who`] = null;
        lineOrder.splice(lineOrder.findIndex((_id)=>_id===follower), 1);
        continue;
      } else if (lineOrder.includes(follower)) {
        canvas.interface.createScrollingText(followerToken, `You can't follow ${leaderToken?.document?.name ?? "someone"}, they are following you!`, {
          anchor: CONST.TEXT_ANCHOR_POINTS.TOP, 
          fill:   "#FF0000", 
          stroke: "#FF0000",
        });
        continue;
      }
      const dist = (Math.max(leaderToken.w, leaderToken.h) + Math.max(followerToken.w, followerToken.h)) / 2;
      const hasCombat = getCombatsForScene(tokenScene(followerToken)?.uuid).length > 0;
      canvas.interface.createScrollingText(followerToken, game.i18n.format(`POKEMON-ASSETS.FollowMe.OnFollow${hasCombat?"Combat":""}`, { name: leaderToken?.document?.name ?? "someone"}), {
        anchor: CONST.TEXT_ANCHOR_POINTS.TOP, 
        fill:   "#FFFFFF", 
        stroke: "#FFFFFF"
      });
      updatesById[follower] ??= {};
      updatesById[follower][`flags.${MODULENAME}.${FLAG_FOLLOWING}.who`] = leader;
      updatesById[follower][`flags.${MODULENAME}.${FLAG_FOLLOWING}.dist`] = dist;
      updatesById[follower][`flags.${MODULENAME}.${FLAG_FOLLOWING}.positions`] = [{x: followerToken.x, y: followerToken.y}, { x: leaderToken.x, y: leaderToken.y }];
      lineOrder.push(follower);

      leader = follower;
    }
  }

  const allUpdates = Object.entries(updatesById).map(([_id, v])=>({_id, ...v}));
  const follower_updates = allUpdates.filter(u=>!allTokens.get(u._id)?.isOwner);
  const updates = allUpdates.filter(u=>follower_updates.findIndex(u2=>u2._id === u._id) === -1);

  canvas.scene.updateEmbeddedDocuments("Token", updates, { follower_updates });
}

function OnManualMove(token, update, operation, follower_updates) {
  if (getCombatsForScene(tokenScene(token)?.uuid).length > 0) return;
  const followers = getAllFollowing(token);

  // check if the token is a follower that just moved
  const newWho = foundry.utils.getProperty(update, `flags.${MODULENAME}.${FLAG_FOLLOWING}.who`);
  const oldWho = foundry.utils.getProperty(token, `flags.${MODULENAME}.${FLAG_FOLLOWING}.who`);
  if (["x", "y"].some(p=>foundry.utils.hasProperty(update, p)) && ( newWho || oldWho ) ) {
    update[`flags.${MODULENAME}.${FLAG_FOLLOWING}.who`] = null;
    canvas.interface.createScrollingText(token, `Follow broken!`, {
      anchor: CONST.TEXT_ANCHOR_POINTS.TOP, 
      fill:   "#FF0000", 
      stroke: "#FF0000"
    });
  }
  follower_updates.push(...getFollowerUpdates(token, operation?.movement, followers));
  operation.animation ??= {};
  operation.animation.follower_speed_modifiers = {};
  // figure out the length of the original's movement
  const mvdist = (t)=>operation?.movement?.[t.id]?.waypoints?.reduce((acc, p)=>({
    dist: acc.dist + Math.hypot(p.x - acc.x, p.y - acc.y),
    x: p.x,
    y: p.y,
  }), { dist: 0, x: t.x, y: t.y})?.dist ?? 0;
  const originalMovement = mvdist(token);
  for (const follower of followers) {
    console.log(originalMovement);
    operation.animation.follower_speed_modifiers[follower.id] = mvdist(follower) / originalMovement;
  };
}

function OnUpdateToken(token, change, options, userId) {
  if (!options?.follower_updates || options.follower_updates.length == 0) return;
  if (!isTheGM() && isGMOnline()) return;
  const scene = tokenScene(token);
  if (!scene) return;
  scene.updateEmbeddedDocuments("Token", options.follower_updates, { follower_updates: [], forced: true });
}

export function register() {
  if (game.modules.get("FollowMe")?.active) {
    if (early_isGM()) {
      Hooks.on("ready", ()=>ui.notifications.warn(`"Pokemon Assets" provides a replacement for "Follow Me!", and may work better if that module is disabled.`));
    }
    return;
  }
  if (!game.settings.get(MODULENAME, "enableFollow")) return;

  Hooks.on("updateToken", OnUpdateToken);
  Hooks.on("pokemon-assets.manualMove", OnManualMove);

  libWrapper.register(MODULENAME, "foundry.data.regionBehaviors.TeleportTokenRegionBehaviorType.events.tokenMoveIn", TeleportTokenRegionBehaviorType_tokenMoveIn, "MIXED");
  // libWrapper.register(MODULENAME, "foundry.data.regionBehaviors.TeleportTokenRegionBehaviorType.events.tokenPreMove", TeleportTokenRegionBehaviorType_tokenPreMove, "MIXED");

  socket.registerSocket("TeleportFollowers", TeleportFollowers);

  game.keybindings.register(MODULENAME, "follow", {
    name: "Follow Token",
    hint: "The key to join or leave the line of tokens being followed.",
    editable: [
      {
        key: "KeyL"
      }
    ],
    onDown: OnFollowKey,
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
}
