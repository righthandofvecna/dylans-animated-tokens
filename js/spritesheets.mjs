import { MODULENAME } from "./utils.mjs";


/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Down-Left-Right-Up (DLRU) style
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceDLRU(sheetKey, slicingInfo, options) {
  const frames = options.frames;
  const [frameWidth, frameHeight] = [slicingInfo.meta.size.w / frames, slicingInfo.meta.size.h / 4];
  for (let c=0; c<frames; c++) {
    for (let r=0; r<4; r++) {
      const direction = (()=>{
        switch (r) {
          case 0: return "down";
          case 1: return "left";
          case 2: return "right";
          case 3: return "up";
        }
      })();
      const key = `${sheetKey}-${direction}${c}`;

      slicingInfo.animations[direction].push(key);
      // handle the fact that this sheet doesn't have diagonals
      if (direction === "down") {
        slicingInfo.animations.downleft.push(key);
        slicingInfo.animations.downright.push(key);
      } else if (direction === "left") {
        slicingInfo.animations.upleft.push(key);
      } else if (direction === "right") {
        slicingInfo.animations.upright.push(key);
      }

      slicingInfo.frames[key] = {
        frame: { x: frameWidth * c, y: frameHeight * r, w: frameWidth, h: frameHeight },
        sourceSize: { w: frameWidth, h: frameHeight },
        spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
      }
    }
  }
}

/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Down-Up-Right-Left Reduced (DURL Reduced) style
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceDURLeduced(sheetKey, slicingInfo, options) {
  const frames = 3; // force this to be 3 for dlruReduced
  const [frameWidth, frameHeight] = [slicingInfo.meta.size.w / frames, slicingInfo.meta.size.h / 4];
  for (let c=0; c<frames; c++) {
    for (let r=0; r<4; r++) {
      const direction = (()=>{
        switch (r) {
          case 0: return "down";
          case 1: return "up";
          case 2: return "right";
          case 3: return "left";
        }
      })();
      const key = `${sheetKey}-${direction}${c}`;

      slicingInfo.animations[direction].push(key);
      // handle the fact that this sheet doesn't have diagonals
      if (direction === "down") {
        slicingInfo.animations.downleft.push(key);
        slicingInfo.animations.downright.push(key);
      } else if (direction === "left") {
        slicingInfo.animations.upleft.push(key);
      } else if (direction === "right") {
        slicingInfo.animations.upright.push(key);
      }

      slicingInfo.frames[key] = {
        frame: { x: frameWidth * c, y: frameHeight * r, w: frameWidth, h: frameHeight },
        sourceSize: { w: frameWidth, h: frameHeight },
        spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
      }
    }
  }

  // duplicate the first texture of each row
  for (const [k, anim] of Object.entries(slicingInfo.animations)) {
    slicingInfo.animations[k] = [anim[0], anim[1], anim[0], anim[2]];
  }
}

/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Eight-Directions (Eight) style (four orthogonal and four diagonal)
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceEight(sheetKey, slicingInfo, options) {
  const frames = options.frames;
  const [frameWidth, frameHeight] = [slicingInfo.meta.size.w / frames, slicingInfo.meta.size.h / 8];
  for (let c=0; c<frames; c++) {
    for (let r=0; r<8; r++) {
      const direction = (()=>{
        switch (r) {
          case 0: return "down";
          case 1: return "downright";
          case 2: return "right";
          case 3: return "upright";
          case 4: return "up";
          case 5: return "upleft";
          case 6: return "left";
          case 7: return "downleft";
        }
      })();
      const key = `${sheetKey}-${direction}${c}`;

      slicingInfo.animations[direction].push(key);

      slicingInfo.frames[key] = {
        frame: { x: frameWidth * c, y: frameHeight * r, w: frameWidth, h: frameHeight },
        sourceSize: { w: frameWidth, h: frameHeight },
        spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
      }
    }
  }
}

/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Diagonal (four Diagonals) style
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceDiagonal(sheetKey, slicingInfo, options) {
  const frames = options.frames;
  const [frameWidth, frameHeight] = [slicingInfo.meta.size.w / frames, slicingInfo.meta.size.h / 4];
  for (let c=0; c<frames; c++) {
    for (let r=0; r<4; r++) {
      const direction = (()=>{
        switch (r) {
          case 0: return "downright";
          case 1: return "upright";
          case 2: return "upleft";
          case 3: return "downleft";
        }
      })();
      const key = `${sheetKey}-${direction}${c}`;

      slicingInfo.animations[direction].push(key);
      // handle the fact that this sheet doesn't have diagonals
      if (direction === "downright") {
        slicingInfo.animations.down.push(key);
      } else if (direction === "upright") {
        slicingInfo.animations.right.push(key);
      } else if (direction === "upleft") {
        slicingInfo.animations.up.push(key);
      } else if (direction === "downleft") {
        slicingInfo.animations.left.push(key);
      }

      slicingInfo.frames[key] = {
        frame: { x: frameWidth * c, y: frameHeight * r, w: frameWidth, h: frameHeight },
        sourceSize: { w: frameWidth, h: frameHeight },
        spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
      }
    }
  }
}

/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Nihey Spritesheet style
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceNihey(sheetKey, slicingInfo, options) {
  const frames = 3; // force this to be 3 for Nihey
  const [frameWidth, frameHeight] = [slicingInfo.meta.size.w / frames, slicingInfo.meta.size.h / 4];
  for (let c=0; c<frames; c++) {
    for (let r=0; r<4; r++) {
      const direction = (()=>{
        switch (r) {
          case 0: return "down";
          case 1: return "up";
          case 2: return "right";
          case 3: return "left";
        }
      })();
      const key = `${sheetKey}-${direction}${c}`;

      slicingInfo.animations[direction].push(key);
      // handle the fact that this sheet doesn't have diagonals
      if (direction === "down") {
        slicingInfo.animations.downleft.push(key);
        slicingInfo.animations.downright.push(key);
      } else if (direction === "left") {
        slicingInfo.animations.upleft.push(key);
      } else if (direction === "right") {
        slicingInfo.animations.upright.push(key);
      }

      slicingInfo.frames[key] = {
        frame: { x: frameWidth * c, y: frameHeight * r, w: frameWidth, h: frameHeight },
        sourceSize: { w: frameWidth, h: frameHeight },
        spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
      }
    }
  }

  // duplicate the second texture of each row
  for (const [k, anim] of Object.entries(slicingInfo.animations)) {
    slicingInfo.animations[k] = [anim[1], anim[0], anim[1], anim[2]];
  }
}

/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Universal LPC Spritesheet style
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceUniversalLPC(sheetKey, slicingInfo, options) {
  const frames = options.frames;
  const [frameWidth, frameHeight] = [slicingInfo.meta.size.w / 13, slicingInfo.meta.size.h / 54];
  for (let c=0; c<9; c++) {
    for (let r=0; r<4; r++) {
      const direction = (()=>{
        switch (r) {
          case 0: return "up";
          case 1: return "left";
          case 2: return "down";
          case 3: return "right";
        }
      })();
      const key = `${sheetKey}-${direction}${c}`;

      slicingInfo.animations[direction].push(key);
      // handle the fact that this sheet doesn't have diagonals
      if (direction === "down") {
        slicingInfo.animations.downleft.push(key);
        slicingInfo.animations.downright.push(key);
      } else if (direction === "left") {
        slicingInfo.animations.upleft.push(key);
      } else if (direction === "right") {
        slicingInfo.animations.upright.push(key);
      }

      slicingInfo.frames[key] = {
        frame: { x: frameWidth * c, y: frameHeight * (r + 8), w: frameWidth, h: frameHeight },
        sourceSize: { w: frameWidth, h: frameHeight },
        spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
      }
    }
  }
}


/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Sleeping Robot's Memao style
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceMemao(sheetKey, slicingInfo, options) {
  const frames = options.frames;
  slicingInfo.animations = {
    ...slicingInfo.animations,
    ...Object.fromEntries(Object.keys(SpritesheetGenerator.DIRECTIONS).map(k=>[`idle${k}`,[]])),
    ...Object.fromEntries(Object.keys(SpritesheetGenerator.DIRECTIONS).map(k=>[`run${k}`,[]])),
  };
  const [frameWidth, frameHeight] = [slicingInfo.meta.size.w / 8, slicingInfo.meta.size.h / 8];
  for (let f=0; f<64; f++) {
    const c = f % 8;
    const r = Math.floor(f / 8);
    const direction = (()=> {
      if (f < 16) return `idle${["down", "up", "left", "right"][~~(f/4)]}`;
      if (f < 40) return ["down", "up", "left", "right"][~~((f-16)/6)];
      if (f < 64) return `run${["down", "up", "left", "right"][~~((f-40)/6)]}`;
    })();
    const key = `${sheetKey}-${direction}${c}`;

    slicingInfo.animations[direction].push(key);
    // handle the fact that this sheet doesn't have diagonals
    if (direction === "down") {
      slicingInfo.animations.downleft.push(key);
      slicingInfo.animations.downright.push(key);
    } else if (direction === "left") {
      slicingInfo.animations.upleft.push(key);
    } else if (direction === "right") {
      slicingInfo.animations.upright.push(key);
    } else if (direction === "idledown") {
      slicingInfo.animations.idledownleft.push(key);
      slicingInfo.animations.idledownright.push(key);
    } else if (direction === "idleleft") {
      slicingInfo.animations.idleupleft.push(key);
    } else if (direction === "idleright") {
      slicingInfo.animations.idleupright.push(key);
    } else if (direction === "rundown") {
      slicingInfo.animations.rundownleft.push(key);
      slicingInfo.animations.rundownright.push(key);
    } else if (direction === "runleft") {
      slicingInfo.animations.runupleft.push(key);
    } else if (direction === "runright") {
      slicingInfo.animations.runupright.push(key);
    }

    slicingInfo.frames[key] = {
      frame: { x: frameWidth * c, y: frameHeight * r, w: frameWidth, h: frameHeight },
      sourceSize: { w: frameWidth, h: frameHeight },
      spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
    }
  }
}

function _uniq(lst) {
  return lst.filter((i,idx)=>lst.indexOf(i) == idx);
}


function sliceFromAnimList(animList, dirOrder, sheetKey, slicingInfo, frames) {
  // populate the initial structure
  slicingInfo.frames ??= {};
  slicingInfo.animations ??= {};
  for (const [a, _] of animList) {
    slicingInfo.animations = {
      ...slicingInfo.animations,
      ...Object.fromEntries(Object.keys(SpritesheetGenerator.DIRECTIONS).map(k=>[`${a}${k}`,[]])),
    }
  }
  // build up the frames and animations
  const nFramesWide = animList.reduce((a, [_, f])=>Math.max(_uniq(f).length, a), 0);
  const [frameWidth, frameHeight] = [slicingInfo.meta.size.w / nFramesWide, slicingInfo.meta.size.h / (animList.length * dirOrder.length)];
  let r = 0;
  for (const [animName, frameOrders] of animList) {
    for (const d of dirOrder) {
      const animKey = `${animName ?? ""}${d}`;
      const sheetFrameKeyPrefix = `${sheetKey}-${animKey}`;
      const uniqFrames = _uniq(frameOrders);
      for (const c of uniqFrames) {
        const key = `${sheetFrameKeyPrefix}${c}`;
        slicingInfo.frames[key] = {
          frame: { x: frameWidth * c, y: frameHeight * r, w: frameWidth, h: frameHeight },
          sourceSize: { w: frameWidth, h: frameHeight },
          spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
        }
      }
      slicingInfo.animations[animKey] = frameOrders.map(f=>`${sheetFrameKeyPrefix}${f}`);
      r += 1;
    }
  }
  // fill in missing animation directions
  for (const [a, _] of animList) {
    if (!dirOrder.includes("upleft")) {
      slicingInfo.animations[`${a}upleft`] = slicingInfo.animations[`${a}left`]
    }
    if (!dirOrder.includes("upright")) {
      slicingInfo.animations[`${a}upright`] = slicingInfo.animations[`${a}right`]
    }
    if (!dirOrder.includes("downleft")) {
      slicingInfo.animations[`${a}downleft`] = slicingInfo.animations[`${a}down`]
    }
    if (!dirOrder.includes("downright")) {
      slicingInfo.animations[`${a}downright`] = slicingInfo.animations[`${a}down`]
    }
  }
}

/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Jordan Bunke's "Top Down Sprite Maker" Gen3 style
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceTDSM_Gen3(sheetKey, slicingInfo, options) {
  const frames = options.frames;
  const animList = [
    ["", [1, 0, 1, 2]],
    ["idle", [0]],
    ["run", [1, 0, 1, 2]],
    ["cycle", [1, 0, 1, 2]],
    ["fish", [0, 1, 2, 3]],
    ["surf", [0, 1]],
    ["pokeball", [0, 1, 2, 3]],
  ];
  const dirOrder = ["down", "left", "right", "up"];
  sliceFromAnimList(animList, dirOrder, sheetKey, slicingInfo, frames)
  for (const dir of Object.keys(SpritesheetGenerator.DIRECTIONS)) {
    if (dir == "down") continue;
    slicingInfo.animations[`pokeball${dir}`] = slicingInfo.animations.pokeballdown ?? [];
  }
}

/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Jordan Bunke's "Top Down Sprite Maker" Gen4 style
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceTDSM_Gen4(sheetKey, slicingInfo, options) {
  const frames = options.frames;
  const animList = [
    ["", [1, 0, 1, 2]],
    ["idle", [0]],
    ["run", [1, 0, 1, 2]],
    ["surf", [0]],
    ["swim", [1, 0, 1, 2]],
  ];
  const dirOrder = ["down", "left", "right", "up"];
  sliceFromAnimList(animList, dirOrder, sheetKey, slicingInfo, frames)
}

/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Jordan Bunke's "Top Down Sprite Maker" PixelCitizen style
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceTDSM_PixelCitizen(sheetKey, slicingInfo, options) {
  const frames = options.frames;
  const animList = [
    ["idle", [0, 1, 2, 3]],
    ["", [0, 1, 2, 3, 4, 5]],
    ["run", [0, 1, 2, 3, 4, 5]],
  ];
  const dirOrder = ["down", "left", "right", "up"];
  sliceFromAnimList(animList, dirOrder, sheetKey, slicingInfo, frames)
}

/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Jordan Bunke's "Top Down Sprite Maker" Time Elements style
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceTDSM_TimeElements(sheetKey, slicingInfo, options) {
  const frames = options.frames;
  const animList = [
    ["", [0, 1, 2]],
    ["idle", [0]],
    ["armsup", [0, 1, 2]],
    ["hold", [0]],
    ["crouch", [0]],
    ["jump", [0, 1, 2, 3]],
    ["anticipate", [0]],
    ["attack", [0, 1, 2, 3]],
    ["heavyattack", [0, 1, 2, 3, 4]],
    ["nockbow", [0]],
    ["bow", [0, 1, 2, 3]],
    ["climb", [0, 1, ]],
    ["sleep", [0]],
  ];
  const dirOrder = ["down", "left", "right", "up"];
  sliceFromAnimList(animList, dirOrder, sheetKey, slicingInfo, frames)
}

/**
 * A function to slice a spritesheet into its component frames.
 * 
 * For the Jordan Bunke's "Top Down Sprite Maker" Time Elements style, only walk and idle
 * 
 * @param {*} sheetKey 
 * @param {*} slicingInfo 
 * @param {*} options 
 */
function sliceTDSM_TimeElementsMini(sheetKey, slicingInfo, options) {
  const frames = options.frames;
  const animList = [
    ["", [0, 1, 2]],
    ["idle", [0]],
  ];
  const dirOrder = ["down", "left", "right", "up"];
  sliceFromAnimList(animList, dirOrder, sheetKey, slicingInfo, frames)
}



/**
 * A function to slice a custom spritesheet into its component frames.
 * 
 * @param {*} sheetKey
 * @param {*} slicingInfo
 * @param {*} options
 */
function sliceCustom(sheetKey, slicingInfo, options) {
  const animList = options.animList ?? ["", [0]];
  const dirOrder = options.dirOrder ?? ["down", "left", "right", "up"];
  sliceFromAnimList(animList, dirOrder, sheetKey, slicingInfo)
  
}

export class SpritesheetGenerator {

  static SHEET_STYLES = {
    custom: {
      label: "DAT.SheetStyle.Custom.Label",
      hint: "DAT.SheetStyle.Custom.Hint",
      slicer: sliceCustom,
      frames: 1, // don't show the number of frames
      hidden: true, // hide this style since it's just for internal use in slicing custom sheets
    },
    dlru: {
      label: "DAT.SheetStyle.DLRU.Label",
      hint: "DAT.SheetStyle.DLRU.Hint",
      slicer: sliceDLRU,
    },
    durlReduced: {
      label: "DAT.SheetStyle.DURLReduced.Label",
      hint: "DAT.SheetStyle.DURLReduced.Hint",
      slicer: sliceDURLeduced,
      frames: 3, // force this to be 3 for durlReduced
    },
    eight: {
      label: "DAT.SheetStyle.Eight.Label",
      hint: "DAT.SheetStyle.Eight.Hint",
      slicer: sliceEight,
      verticalFrames: 8,
    },
    diagonal: {
      label: "DAT.SheetStyle.Diagonal.Label",
      hint: "DAT.SheetStyle.Diagonal.Hint",
      slicer: sliceDiagonal,
    },
    nihey: {
      label: "DAT.SheetStyle.Nihey.Label",
      hint: "DAT.SheetStyle.Nihey.Hint",
      slicer: sliceNihey,
      frames: 3, // force this to be 3 for nihey
    },
    universalLPC: {
      label: "DAT.SheetStyle.UniversalLPC.Label",
      hint: "DAT.SheetStyle.UniversalLPC.Hint",
      slicer: sliceUniversalLPC,
      frames: 13, // force this to be 13 for universalLPC
    },
    memao: {
      label: "DAT.SheetStyle.Memao.Label",
      hint: "DAT.SheetStyle.Memao.Hint",
      slicer: sliceMemao,
      frames: 6, // force this to be 6 for memao
      includesIdle: true, // this style includes an idle animation
      defaultRatio: 1,
    },
    tdsm3: {
      label: "TDSM Gen3 Style",
      hint: "Jordan Bunke's Top Down Sprite Maker Gen3 style",
      slicer: sliceTDSM_Gen3,
      frames: 4, // force this to be 4 for tdsm3
      includesIdle: true, // this style includes an idle animation
      defaultRatio: 4 / 28,
    },
    tdsm4: {
      label: "TDSM Gen4 Style",
      hint: "Jordan Bunke's Top Down Sprite Maker Gen4 style",
      slicer: sliceTDSM_Gen4,
      frames: 3, // force this to be 3 for tdsm4
      includesIdle: true, // this style includes an idle animation
      defaultRatio: 3 / 20,
    },
    tdsmpc: {
      label: "TDSM PixelCitizen Style",
      hint: "Jordan Bunke's Top Down Sprite Maker PixelCitizen style",
      slicer: sliceTDSM_PixelCitizen,
      frames: 6, // force this to be 6 for tdsmpc
      includesIdle: true, // this style includes an idle animation
      defaultRatio: 6 / 12,
    },
    tdsmte: {
      label: "TDSM Time Elements Style",
      hint: "Jordan Bunke's Top Down Sprite Maker Time Elements style",
      slicer: sliceTDSM_TimeElements,
      frames: 5, // force this to be 4 for tdsmte
      includesIdle: true, // this style includes an idle animation
      defaultRatio: 5 / 52,
    },
    tdsmtem: {
      label: "TDSM Time Elements Mini Style",
      hint: "Jordan Bunke's Top Down Sprite Maker Time Elements mini style, walk and idle only",
      slicer: sliceTDSM_TimeElementsMini,
      frames: 3, // force this to be 3 for tdsmtem
      includesIdle: true, // this style includes an idle animation
      defaultRatio: 3 / 8,
    },
  };

  static DIRECTIONS = {
    down:      { x:  0, y:  1 },
    left:      { x: -1, y:  0 },
    right:     { x:  1, y:  0 },
    up:        { x:  0, y: -1 },
    downleft:  { x: -1, y:  1 },
    downright: { x:  1, y:  1 },
    upleft:    { x: -1, y: -1 },
    upright:   { x:  1, y: -1 },
  };

  spritesheets;

  constructor () {
    this.spritesheets = {};
  }

  static generateKey(src, mode, options) {
    if (mode === "custom") {
      const j = JSON.stringify(options);
      const hash = btoa(unescape(encodeURIComponent(j))).slice(0,8); // generate a short hash of the options for the key
      return `${mode}-${hash}:${src}`;
    }
    const frames = options.frames ?? SpritesheetGenerator.SHEET_STYLES[mode]?.frames ?? 1;
    return `${mode}-${frames}:${src}`;
  }

  static generateKeyForToken(tilesetToken) {
    const src = tilesetToken.document.getFlag(MODULENAME, "sheetsrc") ?? tilesetToken.document.texture.src;
    const mode = tilesetToken.sheetStyle;
    const options = {
      frames: tilesetToken.animationFrames,
      animList: tilesetToken.document.getFlag(MODULENAME, "animlist"),
      dirOrder: tilesetToken.document.getFlag(MODULENAME, "dirorder"),
    }
    return SpritesheetGenerator.generateKey(src, mode, options);
  }

  async #getSpritesheet(src, texture, mode, options) {
    const sheetKey = SpritesheetGenerator.generateKey(src, mode, options);
    if (sheetKey in this.spritesheets) {
      if (this.spritesheets[sheetKey]?.baseTexture?.valid) return this.spritesheets[sheetKey];

      // remove the unloaded assets from the cache
      this.spritesheets[sheetKey]._frameKeys.forEach(t=>PIXI.Texture.removeFromCache(t));
    }

    // build up spritesheet slicing info
    const spritesheetSlicingInfo = {
      meta: {
        image: src,
        format: 'RGBA8888',
        size: { w: texture.width, h: texture.height },
        scale: 1
      },
      frames: {},
      animations: Object.keys(SpritesheetGenerator.DIRECTIONS).reduce((a,d)=>({...a, [d]: []}), {}),
    };
    let slicer = SpritesheetGenerator.SHEET_STYLES[mode]?.slicer;
    if (!slicer) {
      console.error(`Unknown spritesheet mode: ${mode}`);
      slicer = SpritesheetGenerator.SHEET_STYLES.dlru.slicer;
    };
    
    // slice the spritesheet
    slicer(sheetKey, spritesheetSlicingInfo, options);

    const spritesheet = new PIXI.Spritesheet(texture, spritesheetSlicingInfo);
    // Generate all the Textures asynchronously
    await spritesheet.parse();

    this.spritesheets[sheetKey] = spritesheet;
    return spritesheet;
  }

  async getTexture(src, texture, mode, options, direction, index=0) {
    const spritesheet = await this.#getSpritesheet(src, texture, mode, options);
    return spritesheet.animations[direction][index];
  }

  async getTextures(src, texture, mode, options) {
    const spritesheet = await this.#getSpritesheet(src, texture, mode, options);
    return spritesheet.animations;
  }

  async getTexturesForToken(tilesetToken, texture) {
    const spritesheet = await this.#getSpritesheet(
      tilesetToken.document.getFlag(MODULENAME, "sheetsrc") ?? tilesetToken.document.texture.src,
      texture,
      tilesetToken.sheetStyle,
      {
        frames: tilesetToken.animationFrames,
        animList: tilesetToken.document.getFlag(MODULENAME, "animlist"),
        dirOrder: tilesetToken.document.getFlag(MODULENAME, "dirorder"),
      }
    );
    spritesheet._registeredTokens ??= new Set();
    spritesheet._registeredTokens.add(tilesetToken);
    return spritesheet.animations;
  }
}


export function register() {
  const module = game.modules.get(MODULENAME);
  module.api ??= {};
  module.api.spritesheetGenerator = new SpritesheetGenerator();
}