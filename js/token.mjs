import { early_isGM, isTheGM, MODULENAME, tokenScene, getCombatsForScene } from "./utils.mjs";
// import { getAllInFollowChain, getAllFollowing } from "./module-compatibility/follow-me.mjs";
import { SpritesheetGenerator } from "./spritesheets.mjs";

/**
 * Add the spritesheet settings to the token config page
 * @param {*} config 
 * @param {*} html 
 * @param {*} context 
 */
async function OnRenderTokenConfig(config, html, context) {
  const form = $(html).find("form").get(0) ?? config.form;
  const token = config.token;

  /**
   * Recalculate all the computed fields, create them if they don't exist, and update them.
   */
  const refreshConfig = async function ({ updateScale } = { updateScale: true }) {
    const rawSrc = form.querySelector("[name='texture.src'] input[type='text']")?.value ?? form.querySelector("[name='texture.src'][type='text']")?.value;
    const src = (()=>{
      if (rawSrc.startsWith(`modules/${MODULENAME}/img`)) return rawSrc;
      if (rawSrc.includes(`modules/${MODULENAME}/img`)) {
        return rawSrc.substring(rawSrc.indexOf(`modules/${MODULENAME}/img`));
      }
      return rawSrc;
    })();
    const predefinedSheetSettings = undefined;
    const isPredefined = predefinedSheetSettings !== undefined;

    const data = {
      spritesheet: isPredefined || (form.querySelector(`input[name='flags.${MODULENAME}.spritesheet']`)?.checked ?? token.getFlag(MODULENAME, "spritesheet")),
      sheetstyle: form.querySelector(`select[name='flags.${MODULENAME}.sheetstyle']`)?.value ?? token.getFlag(MODULENAME, "sheetstyle") ?? "dlru",
      animationframes: (parseInt(form.querySelector(`input[name='flags.${MODULENAME}.animationframes']`)?.value) || token.getFlag(MODULENAME, "animationframes")) ?? 4,
      separateidle: form.querySelector(`input[name='flags.${MODULENAME}.separateidle']`)?.checked ?? token.getFlag(MODULENAME, "separateidle") ?? false,
      noidle: form.querySelector(`input[name='flags.${MODULENAME}.noidle']`)?.checked ?? token.getFlag(MODULENAME, "noidle") ?? false,
      unlockedanchor: token.getFlag(MODULENAME, "unlockedanchor") ?? false,
      unlockedfit: token.getFlag(MODULENAME, "unlockedfit") ?? false,
      ...(predefinedSheetSettings ?? {}),
      MODULENAME,
    };
    const SHEET_STYLE = SpritesheetGenerator.SHEET_STYLES[data.sheetstyle];
    if (SHEET_STYLE?.frames !== undefined) {
      data.animationframes = SHEET_STYLE.frames;
    }

    // Populate the dropdown for the types of spritesheet layouts available
    data.sheetStyleOptions = Object.entries(SpritesheetGenerator.SHEET_STYLES).reduce((allOptions, [val, option])=>{
      return allOptions + `<option value="${val}" ${data.sheetstyle === val ? "selected" : ""}>${game.i18n.localize(option.label)}</option>`;
    }, "");

    // checkbox for whether or not this should be a spritesheet!
    if (!form.querySelector(`[name='flags.${MODULENAME}.spritesheet']`)) {
      $(form).find("[name='texture.src']").before(`<label>Sheet</label><input type="checkbox" name="flags.${MODULENAME}.spritesheet" ${data.spritesheet ? "checked" : ""}>`);
    };
    form.querySelector(`[name='flags.${MODULENAME}.spritesheet']`).checked = data.spritesheet;
    form.querySelector(`[name='flags.${MODULENAME}.spritesheet']`).readonly = isPredefined;

    // locks for "unlockedanchor" and "unlockedfit"
    $(form).find(".toggle-link-anchor-to-sheet").remove();
    const unlockedAnchorLink = $(`<a class="toggle-link-anchor-to-sheet" title="${data.unlockedanchor ? "Base Anchors on Sheet" : "Manual Anchors"}" style="margin-left: 0.3em;"><i class="fa-solid fa-fw ${data.unlockedanchor ? "fa-lock-open" : "fa-lock"}"></i></a>`);
    $(form).find('[name="texture.anchorX"]').closest('.form-group').find('> label').append(unlockedAnchorLink);
    $(unlockedAnchorLink).on("click", ()=>{
      token.setFlag(MODULENAME, "unlockedanchor", !data.unlockedanchor);
    });
    if (!data.unlockedanchor) {
      $(form).find('[name="texture.anchorX"]').prop("disabled", true);
      $(form).find('[name="texture.anchorY"]').prop("disabled", true);
    }

    $(form).find(".toggle-link-fit-to-sheet").remove();
    const unlockedFitLink = $(`<a class="toggle-link-fit-to-sheet" title="${data.unlockedfit ? "Base Fit on Sheet" : "Manual Fit"}" style="margin-left: 0.3em;"><i class="fa-solid fa-fw ${data.unlockedfit ? "fa-lock-open" : "fa-lock"}"></i></a>`);
    $(form).find('[name="texture.fit"]').closest('.form-group').find('> label').append(unlockedFitLink);
    $(unlockedFitLink).on("click", ()=>{
      token.setFlag(MODULENAME, "unlockedfit", !data.unlockedfit);
    });
    if (!data.unlockedfit) {
      $(form).find('[name="texture.fit"]').prop("disabled", true);
    }

    // additional spritesheet-specific configurations
    data.showframes = SHEET_STYLE?.frames === undefined;
    data.showidle = game.settings.get(MODULENAME, "playIdleAnimations") && !data.separateidle;
    data.hide = !data.spritesheet || isPredefined;
    data.hideaux = !data.spritesheet;
    const rendered = $(await renderTemplate(`modules/${MODULENAME}/templates/token-settings.hbs`, data)).get(0);
    if (!form.querySelector(".spritesheet-config")) {
      $(form).find("[name='texture.src']").closest(".form-group").after(`<div class="spritesheet-config"></div>`)
    };
    form.querySelector(".spritesheet-config-aux")?.remove();
    form.querySelector(".spritesheet-config").replaceWith(rendered);

    // check that the anchoring fields exist
    for (const tf of ["fit", "anchorX", "anchorY"]) {
      if (!form.querySelector(`[name='texture.${tf}']`)) {
        $(form).append(`<input name="texture.${tf}" value="${token?.texture?.[tf]}" hidden />`);
      }
    }

    // update the anchors
    if (!data.spritesheet) {
      // reset the anchors if they exist
      if (!data.unlockedfit) form.querySelector("[name='texture.fit']").value = "contain";
      if (!data.unlockedanchor) {
        form.querySelector("[name='texture.anchorX']").value = 0.5;
        form.querySelector("[name='texture.anchorY']").value = 0.5;
      }
      return;
    } else {
      switch (game.system.id) {
        case "ptu":
          if (token?.flags?.ptu?.autoscale) {
            await token.setFlag("ptu", "autoscale", false).then(()=>refreshConfig({ updateScale }));
            return;
          }
          break;
        case "ptr2e":
          if (token?.flags?.ptr2e?.autoscale) {
            await token.setFlag("ptr2e", "autoscale", false).then(()=>refreshConfig({ updateScale }));
            return;
          }
          break;
      }
    };

    const scaleFormEl = form.querySelector("input[name='scale']");
    if (updateScale && !!scaleFormEl) {
      scaleFormEl.value = data.scale ?? 1;
      const scaleFormLabel = $(scaleFormEl).next();
      if (scaleFormLabel.is(".range-value")) {
        scaleFormLabel.text(`${data.scale ?? 1}`);
      }
    }

    const texture = await loadTexture(src, {fallback: CONST.DEFAULT_TOKEN});
    const { width, height } = texture ?? {};
    if (!width || !height) return;
    const directions = (()=>{
      switch (data.sheetstyle) {
        case "pmd": return 8;
        default: return 4;
      }
    })();

    const ratio = (height / width) * (data.animationframes / directions);
    const scale = form.querySelector("input[name='scale']")?.value ?? 1;
    const anchorY = (()=>{
      switch (data.sheetstyle) {
        case "pmd": return 0.5;
        default: return 1.02 + (0.5 / (-ratio * scale));
      }
    })();

    // set the anchoring fields
    if (data.spritesheet && !data.unlockedfit) form.querySelector("[name='texture.fit']").value = "width";
    if (data.spritesheet && !data.unlockedanchor) {
      form.querySelector("[name='texture.anchorX']").value = 0.5;
      form.querySelector("[name='texture.anchorY']").value = Math.ceil(100 * anchorY) / 100;
    }
  };

  await refreshConfig();

  //
  // listeners
  //

  $(form).on("change", "[name='texture.src'] input[type='text'], input[name='texture.src'][type='text']", refreshConfig);
  // dumb workaround to listen on the filepicker button too
  $(form).on("click", "[name='texture.src'] button", function () {
    const filePicker = $(this).closest("file-picker")?.get(0)?.picker;
    if (!filePicker) return;
    filePicker.callback = ((callback)=>{
      return function () {
        if (callback) callback(...arguments);
        refreshConfig();
      }
    })(filePicker.callback);
  })

  // listen for the "spritesheet" toggle
  $(form).on("change", `[name='flags.${MODULENAME}.spritesheet']`, refreshConfig);

  $(form).on("change", `[name='flags.${MODULENAME}.sheetstyle']`, refreshConfig);

  $(form).on("change", `[name='flags.${MODULENAME}.animationframes']`, refreshConfig);

  // listen for the "scale" value
  $(form).on("change", "[name='scale']", ()=>refreshConfig({updateScale: false}));
}


/**
 * When a token's spritesheet settings have been updated, re-render the token immediately
 * Otherwise, it will take a scene/browser reload to display the changed settings.
 * @param {*} token 
 * @param {*} changes 
 * @param {*} metadata 
 * @param {*} user 
 * @returns 
 */
function OnUpdateToken(token, changes, metadata, user) {
  if (!changes?.texture?.src &&
    !changes?.flags?.[MODULENAME]?.sheetstyles &&
    !changes?.flags?.[MODULENAME]?.animationframes)
    return;

  const src = changes?.texture?.src ?? token?.texture?.src;
  if (!src) return;
  
  const tokenObj = token?.object;
  if (!tokenObj) return

  tokenObj.renderFlags.set({
    redraw: true
  });
  tokenObj.applyRenderFlags();
}


/* ------------------------------------------------------------------------- */



function OnPreUpdateToken(doc, change, options) {
  if (!doc.getFlag(MODULENAME, "spritesheet")) return;

  const ox = doc.x ?? 0;
  const nx = change?.x ?? ox;
  const oy = doc.y ?? 0;
  const ny = change?.y ?? oy;

  const dx = nx - ox;
  const dy = ny - oy;
  if ((dx !== 0 || dy !== 0) && !options.teleport) {
    change.rotation = getAngleFromDirection(getDirection(dx, dy));
  };

  const { sizeY } = game?.scenes?.active?.grid ?? { sizeX: 100, sizeY: 100 };

  // sort 
  change.sort = Math.floor(ny / sizeY);
}

function getDirection(dx, dy) {
  // normalized rounded dx, dy
  const nrdx = Math.sign(Math.round(dx / Math.abs(dy || dx || 1)));
  const nrdy = Math.sign(Math.round(dy / Math.abs(dx || dy || 1)));
  const result = Object.entries(SpritesheetGenerator.DIRECTIONS).find(([d, { x, y }])=>x === nrdx && y === nrdy)?.[0];
  return result ?? "down";
}

function getAngleFromDirection(d) {
  switch (d) {
    case "down": return 0;
    case "left": return 90;
    case "right": return 270;
    case "up": return 180;
    case "downleft": return 45;
    case "downright": return 315;
    case "upleft": return 135;
    case "upright": return 225;
  }
  return 0;
}

function getDirectionFromAngle(angle) {
  switch (Math.floor(((angle + 22.5) % 360) / 45)) {
    case 0: return "down";
    case 1: return "downleft";
    case 2: return "left";
    case 3: return "upleft";
    case 4: return "up";
    case 5: return "upright";
    case 6: return "right";
    case 7: return "downright";
  }
  return "down";
}


function OnCreateCombatant(combatant) {
  if (!isTheGM()) return;
  if (!combatant?.token?.getFlag(MODULENAME, "spritesheet")) return;
  combatant.update({
    "img": combatant?.actor?.img ?? "icons/svg/mystery-man.svg",
  });
}




/** Initialize all the edges for tokens when the canvas refreshes */
function OnInitializeEdges() {
  for (const token of canvas.tokens.placeables) {
    token?.initializeEdges?.();
  }
  for (const tile of canvas.tiles.placeables) {
    tile?.initializeEdges?.();
  }
}

export function register() {
  class TilesetToken extends CONFIG.Token.objectClass {
    #index;
    #textures;
    #textureSrc;
    #textureKey;
    #direction;
    #animationData;
    #priorAnimationData;
    #localOpacity;

    constructor(document) {
      super(document);
      this.#initialize();
    }

    #initialize() {
      this.#animationData = this._getAnimationData();
      this.#priorAnimationData = foundry.utils.deepClone(this.#animationData);
      this.#localOpacity = 1;
    }

    /** @override */
    clear() {
      super.clear();
      this.#index = 0;
      this.#textures = null;
      this.#textureSrc = null;
      this.#direction = "down";
    }

    get isTileset() {
      return this.document.getFlag(MODULENAME, "spritesheet");
    }

    get sheetStyle() {
      return this.document.getFlag(MODULENAME, "sheetstyle") ?? "trainer";
    }

    get animationFrames() {
      return this.document.getFlag(MODULENAME, "animationframes") ?? 4;
    }

    get separateIdle() {
      return this.document.getFlag(MODULENAME, "separateidle") ?? false;
    }

    get alwaysIdle() {
      return !this.separateIdle && game.settings.get(MODULENAME, "playIdleAnimations") && !this.document.getFlag(MODULENAME, "noidle");
    }

    get allAnimationsPromise() {
      return Promise.allSettled(this.animationContexts.values().map(c=>c.promise))
    }

    /** @override */
    async _draw(options) {
      // check if this token has a tileset configured
      if (!this.isTileset) return super._draw(options);
      
      this.#cleanData();

      // Load token texture
      await this.playFromSpritesheet();
  
      // Draw the TokenMesh in the PrimaryCanvasGroup
      this.mesh = canvas.primary.addToken(this);
  
      // Initialize token ring
      // this.#initializeRing();
      // Can't do this...
  
      // Draw the border
      this.border ||= this.addChild(new PIXI.Graphics());
  
      // Draw the void of the TokenMesh
      if ( !this.voidMesh ) {
        this.voidMesh = this.addChild(new PIXI.Container());
        this.voidMesh.updateTransform = () => {};
        this.voidMesh.render = renderer => this.mesh?._renderVoid(renderer);
      }
  
      // Draw the detection filter of the TokenMesh
      if ( !this.detectionFilterMesh ) {
        this.detectionFilterMesh = this.addChild(new PIXI.Container());
        this.detectionFilterMesh.updateTransform = () => {};
        this.detectionFilterMesh.render = renderer => {
          if ( this.detectionFilter ) this._renderDetectionFilter(renderer);
        };
      }
  
      // Draw Token interface components
      this.bars ||= this.addChild(this.#drawAttributeBars());
      this.tooltip ||= this.addChild(this.#drawTooltip());
      this.effects ||= this.addChild(new PIXI.Container());
  
      this.target ||= this.addChild(new PIXI.Graphics());
      this.nameplate ||= this.addChild(this.#drawNameplate());
  
      // Add filter effects
      this._updateSpecialStatusFilterEffects();
  
      // Draw elements
      await this._drawEffects();
  
      // Initialize sources
      if ( !this.isPreview ) this.initializeSources();

    }

    async playFromSpritesheet() {
      const genSpritesheetKey = SpritesheetGenerator.generateKey(this.document.texture.src, this.sheetStyle, this.animationFrames);
      if (this.#textures == null || this.#textureSrc !== this.document.texture.src || this.#textureKey !== genSpritesheetKey) {
        let texture;
        if ( this._original ) texture = this._original.texture?.clone();
        else texture = await loadTexture(this.document.texture.src, {fallback: CONST.DEFAULT_TOKEN});

        this.#textureSrc = this.document.texture.src;
        this.#textures = await game.modules.get(MODULENAME).api.spritesheetGenerator.getTexturesForToken(this, texture);
        this.#textureKey = genSpritesheetKey;
      }
      this.#updateDirection();
      this.texture = this.#textures[this.#facing][this.#index];
    }

    get isometric() {
      return game.modules.get("isometric-perspective")?.active && tokenScene(this.document)?.flags?.["isometric-perspective"]?.isometricEnabled;
    }

    get direction() {
      return this.#direction;
    }

    get #facing() {
      if (this.isometric) {
        const options = [
          "down",
          "downright", 
          "right",
          "upright",
          "up",
          "upleft",
          "left",
          "downleft",
          "down"];
        return options[options.indexOf(this.#direction)+1];
      }
      return this.#direction;
    }

    set direction(value) {
      this.#direction = value;
      if (this.#textures != null) {
        this.texture = this.#textures[this.#facing][this.#index];
        if (this.mesh.texture != this.texture) {
          this.mesh.texture = this.texture;
          this.renderFlags.set({
            refreshMesh: true,
          });
        }
      }
    }

    set localOpacity(opacity) {
      opacity = Math.clamp(opacity ?? 1, 0, 1);
      const oldLocal = this.#localOpacity;
      this.#localOpacity = opacity;
      if (oldLocal !== opacity) {
        this.renderFlags.set({
          refreshState: true,
        })
        this.applyRenderFlags();
      }
    }

    _refreshState() {
      super._refreshState();
      this.mesh.alpha = this.alpha * (this.hover ? Math.clamp(this.#localOpacity, 0.2, 1) : this.#localOpacity ) * this.document.alpha;
    }

    /**
     * Apply initial sanitizations to the provided input data to ensure that a Token has valid required attributes.
     * Constrain the Token position to remain within the Canvas rectangle.
     */
    #cleanData() {
      const d = this.scene.dimensions;
      const {x: cx, y: cy} = this.getCenterPoint({x: 0, y: 0});
      this.document.x = Math.clamp(this.document.x, -cx, d.width - cx);
      this.document.y = Math.clamp(this.document.y, -cy, d.height - cy);
    }

    /* -------------------------------------------- */

    /**
     * Draw resource bars for the Token
     * @returns {PIXI.Container}
     */
    #drawAttributeBars() {
      const bars = new PIXI.Container();
      bars.bar1 = bars.addChild(new PIXI.Graphics());
      bars.bar2 = bars.addChild(new PIXI.Graphics());
      return bars;
    }

    /* -------------------------------------------- */

    /**
     * Draw the token's nameplate as a text object
     * @returns {PreciseText}    The Text object for the Token nameplate
     */
    #drawNameplate() {
      const nameplate = new PreciseText(this.document.name, this._getTextStyle());
      nameplate.anchor.set(0.5, 0);
      return nameplate;
    }

    /* -------------------------------------------- */

    /**
     * Draw a text tooltip for the token which can be used to display Elevation or a resource value
     * @returns {PreciseText}     The text object used to render the tooltip
     */
    #drawTooltip() {
      const tooltip = new PreciseText(this._getTooltipText(), this._getTextStyle());
      tooltip.anchor.set(0.5, 1);
      return tooltip;
    }

    #updateDirection() {
      this.#direction = getDirectionFromAngle(this.document.rotation);
    }

    /**
     * Refresh the rotation.
     * @protected
     */
    _refreshRotation() {
      if (!this.isTileset) return super._refreshRotation();

      this.mesh.angle = 0;
      this.#updateDirection();
      this.#index = 0;
      if (this.#textures != null) {
        this.texture = this.#textures[this.#facing][this.#index];
        if (this.mesh.texture != this.texture) {
          this.mesh.texture = this.texture;
          this.renderFlags.set({
            refreshMesh: true,
          });
        }
      }
    }

    /** @override */
    async animate(to, {duration, easing, movementSpeed, name, ontick, ...options}={}) {
      // Get the name and the from and to animation data
      if ( name === undefined ) name = this.animationName;
      else name ||= Symbol(this.animationName);
      const from = this.#animationData;
      this.#animationData.frame = 0
      if (to.rotation != undefined) {
        from.rotation = to.rotation ?? from.rotation;
        delete to.rotation;
      }
      to = foundry.utils.filterObject(to, from);
      let context = this.animationContexts.get(name);
      if ( context ) to = foundry.utils.mergeObject(context.to, to, {inplace: false});

      // Conclude the current animation
      CanvasAnimation.terminateAnimation(name);
      if ( context ) this.animationContexts.delete(name);

      movementSpeed ??= (()=>{
        if (this.document._sliding) return game.settings.get(MODULENAME, "walkSpeed") ?? 4;
        const { sizeX, sizeY } = game?.scenes?.active?.grid ?? { sizeX: 100, sizeY: 100 };
        const manhattan = (Math.abs((to.x ?? from.x) - from.x) / sizeX) + (Math.abs((to.y ?? from.y) - from.y) / sizeY);
        if (manhattan < (game.settings.get(MODULENAME, "runDistance") ?? 5)) {
          return game.settings.get(MODULENAME, "walkSpeed") ?? 4;
        }
        return game.settings.get(MODULENAME, "runSpeed") ?? 8;
      })();
      // Get the animation duration and create the animation context
      duration ??= this._getAnimationDuration(from, to, {movementSpeed, ...options});
      const origin = { x: this.x, y: this.y };
      context = {name, to, origin, duration, time: 0, preAnimate: [], postAnimate: [], onAnimate: []};

      // Animate the first frame
      this._animateFrame(context);

      // If the duration of animation is not positive, we can immediately conclude the animation
      if ( duration <= 0 ) return;

      // Set the animation context
      this.animationContexts.set(name, context);

      // Prepare the animation data changes
      const changes = foundry.utils.diffObject(from, to);
      const attributes = this._prepareAnimation(from, changes, context, options);

      // Dispatch the animation
      context.promise = CanvasAnimation.animate(attributes, {
        name,
        context: this,
        duration,
        easing,
        priority: PIXI.UPDATE_PRIORITY.OBJECTS + 1, // Before perception updates and Token render flags
        wait: Promise.allSettled(context.preAnimate.map(fn => fn(context))),
        ontick: (dt, anim) => {
          context.time = anim.time;
          if ( ontick ) ontick(dt, anim, this.#animationData);
          this._animateFrame(context);
        }
      });
      await context.promise.finally(() => {
        if ( this.animationContexts.get(name) === context ) {
          this.animationContexts.delete(name);
          // start the idle animation
          this.startIdleAnimation();
        }
        for ( const fn of context.postAnimate ) fn(context);
      });
    }

    get idleAnimationDuration() {
      return game.settings.get(MODULENAME, "idleAnimTime") ?? 600;
    }

    startIdleAnimation() {
      const fia = this.framesInAnimation;
      if (fia <= 1) return;
      const iad = this.idleAnimationDuration;
      if (iad <= 0) return;
      if (this.alwaysIdle) {
        this.animate({ frame: fia }, { duration: fia * iad });
      }
    }

    /**
     * Prepare the animation data changes: performs special handling required for animating rotation (none).
     * @param {TokenAnimationData} from                         The animation data to animate from
     * @param {Partial<TokenAnimationData>} changes             The animation data changes
     * @param {Omit<TokenAnimationContext, "promise">} context  The animation context
     * @param {object} [options]                                The options that configure the animation behavior
     * @param {string} [options.transition="fade"]              The desired texture transition type
     * @returns {CanvasAnimationAttribute[]}                    The animation attributes
     * @protected
     */
    _prepareAnimation(from, changes, context, options = {}) {
      const attributes = [];

      // Token.#handleRotationChanges(from, changes);
      // this.#handleTransitionChanges(changes, context, options, attributes);

      // Create animation attributes from the changes
      const recur = (changes, parent) => {
        for ( const [attribute, to] of Object.entries(changes) ) {
          const type = foundry.utils.getType(to);
          if ( type === "Object" ) recur(to, parent[attribute]);
          else if ( type === "number" || type === "Color" ) attributes.push({attribute, parent, to});
        }
      };
      recur(changes, this.#animationData);
      return attributes;
    }

    /**
     * Handle a single frame of a token animation.
     * @param {TokenAnimationContext} context    The animation context
     */
    _animateFrame(context) {
      if ( context.time >= context.duration ) foundry.utils.mergeObject(this.#animationData, context.to);
      const changes = foundry.utils.diffObject(this.#priorAnimationData, this.#animationData);
      foundry.utils.mergeObject(this.#priorAnimationData, this.#animationData);
      foundry.utils.mergeObject(this.document, this.#animationData, {insertKeys: false});
      for ( const fn of context.onAnimate ) fn(context);
      this._onAnimationUpdate(changes, context);
    }

    get framesInAnimation() {
      if (!this.isTileset || this.#textures == null) return 1;
      const idxOffset = this.separateIdle ? 1 : 0;
      return this.#textures[this.#facing].length - idxOffset;
    }

    _onAnimationUpdate(changed, context) {
      const irrelevant = !["x", "y", "rotation", "frame"].some(p=>foundry.utils.hasProperty(changed, p));
      if (irrelevant || !this.isTileset || this.#textures == null) return super._onAnimationUpdate(changed, context);

      // get tile size
      const { sizeX, sizeY } = game?.scenes?.active?.grid ?? { sizeX: 100, sizeY: 100 };

      const FRAMES_PER_SQUARE = 2;
      const gdx = Math.abs((changed.x ?? context.origin?.x ?? 0) - context.origin?.x ?? 0) * FRAMES_PER_SQUARE / sizeX;
      const gdy = Math.abs((changed.y ?? context.origin?.y ?? 0) - context.origin?.y ?? 0) * FRAMES_PER_SQUARE / sizeY;
      const frame = changed.frame !== undefined ? ~~changed.frame : ~~(gdx + gdy - (Math.min(gdx, gdy) / 2));

      // set the direction
      const dx = (context?.to?.x ?? changed.x ?? 0) - (changed.x ?? context?.to?.x ?? 0);
      const dy = (context?.to?.y ?? changed.y ?? 0) - (changed.y ?? context?.to?.y ?? 0);
      if (dx != 0 || dy != 0 || changed.frame != undefined) {
        if (this.document._spinning) { // spinning
          this.#index = 0;
          this.#direction = ["down", "right", "up", "left"][frame % 4];
        } else { // normal animation
          if (dx != 0 || dy != 0) this.#direction = getDirection(dx, dy);
          const idxOffset = this.separateIdle ? 1 : 0;
          this.#index = idxOffset + ( frame % this.framesInAnimation );
        }

        // don't animate rotation while moving
        if (changed.rotation != undefined) {
          delete changed.rotation;
        }
      } else {
        this.#updateDirection();
        this.#index = 0;
      }

      if (this.document._sliding) { // slide with one leg out
        this.#index = Math.min(1, this.#textures[this.#facing].length);
      }

      const newTexture = this.#textures[this.#facing][this.#index];
      if (this.mesh.texture != newTexture) {
        this.mesh.texture = newTexture;
        this.renderFlags.set({
          refreshMesh: true,
        });
      }
      return super._onAnimationUpdate(changed, context);
    }

    /**
     * Move the token immediately to the destination if it is teleported.
     * @param {Partial<TokenAnimationData>} to    The animation data to animate to
     */
    _handleTeleportAnimation(to) {
      const changes = {};
      if ( "x" in to ) this.#animationData.x = changes.x = to.x;
      if ( "y" in to ) this.#animationData.y = changes.y = to.y;
      if ( "elevation" in to ) this.#animationData.elevation = changes.elevation = to.elevation;
      if ( !foundry.utils.isEmpty(changes) ) {
        const context = {name: Symbol(this.animationName), to: changes, duration: 0, time: 0,
          preAnimate: [], postAnimate: [], onAnimate: []};
        this._onAnimationUpdate(changes, context);
      }
    }

    get shouldHaveEdges() {
      return game.settings.get(MODULENAME, "tokenCollision") && (!this.document.hidden || game.settings.get(MODULENAME, "tokenCollisionHidden"));
    }

    /**
     * Check for collisions, but exclude tokens of the same disposition and tokens in your follow chain
     */
    checkCollision(destination, {origin, type="move", mode="any", follow=false}={}) {
      const collisions = super.checkCollision(destination, { origin, type, mode: "all" });
      if (!collisions) return collisions;

      const unignoredCollisions = collisions.filter(collision=>collision.edges?.some(edge=>(edge?.object?.document?.disposition != this.document.disposition || game.settings.get(MODULENAME, "tokenCollisionAllied"))));

      if (mode == "all") return unignoredCollisions;
      return unignoredCollisions[0] || null;
    }

    initializeEdges({ changes, deleted=false}={}) {
      // the token has been deleted
      if ( deleted ) {
        ["t","r","b","l","tl","tr","bl","br"].forEach(d=>canvas.edges.delete(`${this.id}_${d}`));
        return;
      }

      if (!this.shouldHaveEdges) return;

      // re-create the edges for the token
      const docX = changes?.x ?? this.document.x;
      const docY = changes?.y ?? this.document.y;
      const width = changes?.width ?? this.document.width;
      const height = changes?.height ?? this.document.height;

      const { sizeX: gridX, sizeY: gridY } = canvas.grid;
      const w = gridX * Math.max(width, 1);
      const h = gridY * Math.max(height, 1);
      const wDia = gridX / 2;
      const hDia = gridY / 2;
      const wOrth = w - (wDia * 2);
      const hOrth = h - (hDia * 2);
      const { x, y } = canvas.grid.getSnappedPoint({ x: docX, y: docY }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER });

      const pointList = [];
      const suffixList = [];

      // if the width or height of the token is < 1, we have to do one corner square, unless it's centered
      let position = "center";
      if (width < 1 || height < 1) {
        const docL = docX;
        const docR = docX + (gridX * width);
        const docT = docY;
        const docB = docY + (gridY * height);
        if (docL < x + (w / 4)) {
          if (docT < y + (h / 4)) {
            position = "tl";
          } else if (docB > y + (3 * h / 4)) {
            position = "bl";
          }
        } else if (docR > x + (3 * w / 4)) {
          if (docT < y + (h / 4)) {
            position = "tr";
          } else if (docB > y + (3 * h / 4)) {
            position = "br";
          }
        }
      }

      // currently at the top-left point
      if (position == "tl") {
        suffixList.push("l", "t");
        pointList.push(x, y, x + wDia, y);
      } else {
        suffixList.push("tl");
        pointList.push(x + wDia, y);
        if (wOrth > 0) {
          suffixList.push("t");
          pointList.push(x + wDia + wOrth, y);
        }
      }
      // currently at the top-right point
      if (position == "tr") {
        suffixList.push("t", "r");
        pointList.push(x + w, y, x + w, y + hDia);
      } else {
        suffixList.push("tr");
        pointList.push(x + w, y + hDia);
        if (hOrth > 0) {
          suffixList.push("r");
          pointList.push(x + w, y + hDia + hOrth);
        }
      }
      // currently at the bottom-right point
      if (position == "br") {
        suffixList.push("r", "b");
        pointList.push(x + w, y + h, x + wDia, y + h);
      } else {
        suffixList.push("br");
        pointList.push(x + wDia + wOrth, y + h);
        if (wOrth > 0) {
          suffixList.push("b");
          pointList.push(x + wDia, y + h);
        }
      }
      // currently at the bottom-left point
      if (position == "bl") {
        suffixList.push("b", "l");
        pointList.push(x, y + h, x, y + hDia);
      } else {
        suffixList.push("bl");
        pointList.push(x, y + hDia + hOrth);
        if (hOrth > 0) {
          suffixList.push("l");
          pointList.push(x, y + hDia);
        }
      }

      // create edges
      pointList.unshift(pointList[pointList.length-1]);
      pointList.unshift(pointList[pointList.length-2]);
      const polygonList = [];
      for (let i = 0; i < suffixList.length; i++) {
        const offset = i*2;
        this._setEdge(`${this.id}_${suffixList[i]}`, [pointList[offset + 0], pointList[offset + 1], pointList[offset + 2], pointList[offset + 3]]);
        polygonList.push([pointList[offset + 0], pointList[offset + 1]], [pointList[offset + 2], pointList[offset + 3]]);
      }

      // remove unused edges
      for (const direction of ["t","r","b","l","tl","tr","bl","br"]) {
        if (suffixList.includes(direction)) continue;
        canvas.edges.delete(`${this.id}_${direction}`);
      }
    }

    _setEdge(id, c) {
      canvas.edges.set(id, new foundry.canvas.edges.Edge({x: c[0], y: c[1]}, {x: c[2], y: c[3]}, {
        id,
        object: this,
        type: "wall",
        direction: CONST.WALL_DIRECTIONS.LEFT,
        light: CONST.WALL_SENSE_TYPES.NONE,
        sight: CONST.WALL_SENSE_TYPES.NONE,
        sound: CONST.WALL_SENSE_TYPES.NONE,
        move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
        threshold: {
          light: 0,
          sight: 0,
          sound: 0,
          attenuation: false,
        }
      }));
    }

    /** @inheritDoc */
    _onCreate(data, options, userId) {
      super._onCreate(data, options, userId);
      this.initializeEdges();
    }

    /** @inheritDoc */
    _onUpdate(changed, options, userId) {
      if (options.teleport === true) {
        const to = foundry.utils.filterObject(this._getAnimationData(), changed);
        this._handleTeleportAnimation(to);
      }
      super._onUpdate(changed, options, userId);
      if ("x" in changed || "y" in changed || "width" in changed || "height" in changed || "hidden" in changed) {
        this.initializeEdges({ changes: changed, deleted: !this.shouldHaveEdges });
      }
      if ("hidden" in changed && !changed.hidden) {
        this.#localOpacity = 1;
      }
    }

    /** @inheritDoc */
    _onDelete(options, userId) {
      super._onDelete(options, userId);
      this.initializeEdges({deleted: true});
    }

  };

  CONFIG.Token.objectClass = TilesetToken;

  Object.defineProperty(CONFIG.Token.documentClass.prototype, "movable", {
    get() {
      return (this._movementLocks?.size ?? 0) === 0;
    }
  });

  Hooks.on("renderTokenConfig", OnRenderTokenConfig);
  Hooks.on("updateToken", OnUpdateToken);
  Hooks.on("preUpdateToken", OnPreUpdateToken);
  Hooks.on("initializeEdges", OnInitializeEdges);
  if (early_isGM()) {
    Hooks.on("createCombatant", OnCreateCombatant);
  }
}