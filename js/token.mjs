import { early_isGM, isTheGM, MODULENAME, tokenScene, getCombatsForScene } from "./utils.mjs";
import { getAllInFollowChain, getAllFollowing } from "./module-compatibility/follow-me.mjs";
import { SpritesheetGenerator } from "./spritesheets.mjs";
import { NonPrivateTokenMixin } from "./foundry/token.mjs";

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
    
    // Convert aliased sheet styles to their canonical equivalents
    let SHEET_STYLE = SpritesheetGenerator.SHEET_STYLES[data.sheetstyle];
    if (SHEET_STYLE?.alias) {
      data.sheetstyle = SHEET_STYLE.alias;
      SHEET_STYLE = SpritesheetGenerator.SHEET_STYLES[data.sheetstyle];
    }
    
    if (SHEET_STYLE?.frames !== undefined) {
      data.animationframes = SHEET_STYLE.frames;
    }

    // Populate the dropdown for the types of spritesheet layouts available (exclude aliases)
    data.sheetStyleOptions = Object.entries(SpritesheetGenerator.SHEET_STYLES)
      .filter(([val, option]) => !option.alias) // Filter out aliased entries
      .reduce((allOptions, [val, option])=>{
        return allOptions + `<option value="${val}" ${data.sheetstyle === val ? "selected" : ""}>${game.i18n.localize(option.label)}</option>`;
      }, "");

    // checkbox for whether or not this should be a spritesheet!
    if (!form.querySelector(`[name='flags.${MODULENAME}.spritesheet']`)) {
      $(form).find("[name='texture.src']").before(`<label>Sheet</label><input type="checkbox" name="flags.${MODULENAME}.spritesheet" ${data.spritesheet ? "checked" : ""}>`);
    };
    form.querySelector(`[name='flags.${MODULENAME}.spritesheet']`).checked = data.spritesheet;
    form.querySelector(`[name='flags.${MODULENAME}.spritesheet']`).readonly = isPredefined;

    // locks for "unlockedanchor" and "unlockedfit"
    for (const [tf,tfInput] of Object.entries({
      "fit": new foundry.data.fields.StringField({ label: "Fit", choices: ()=>({"fill": "Fill", "contain": "Contain", "cover": "Cover", "width": "Width", "height": "Height"}) }),
      "anchorX": new foundry.data.fields.NumberField({ label: "Anchor X" }),
      "anchorY": new foundry.data.fields.NumberField({ label: "Anchor Y" })
    })) {
      if (!form.querySelector(`[name='texture.${tf}']`)) {
        // place to put it
        let spot = $(form).find("fieldset.size");
        if (!spot.length) spot = $(form);
        $(spot).append(`<div class="form-group ${tf}"><label>${tfInput.label}</label><div class="form-fields">${tfInput.toInput({ name: "texture." + tf, value: token?.texture?.[tf] }).outerHTML}</div></div>`);
      }
    }

    $(form).find(".toggle-link-anchor-to-sheet").remove();
    const unlockedAnchorLink = $(`<a class="toggle-link-anchor-to-sheet" title="${data.unlockedanchor ? "Base Anchors on Sheet" : "Manual Anchors"}" style="margin-left: 0.3em;"><i class="fa-solid fa-fw ${data.unlockedanchor ? "fa-lock-open" : "fa-lock"}"></i></a>`);
    $(form).find('[name="texture.anchorX"]').closest('.form-group').find('> label').append(unlockedAnchorLink);
    $(unlockedAnchorLink).on("click", ()=>{
      token.setFlag(MODULENAME, "unlockedanchor", !data.unlockedanchor);
    });
    if (!data.unlockedanchor) {
      $(form).find('[name="texture.anchorX"]').prop("readonly", true);
      $(form).find('[name="texture.anchorY"]').prop("readonly", true);
    }

    $(form).find(".toggle-link-fit-to-sheet").remove();
    const unlockedFitLink = $(`<a class="toggle-link-fit-to-sheet" title="${data.unlockedfit ? "Base Fit on Sheet" : "Manual Fit"}" style="margin-left: 0.3em;"><i class="fa-solid fa-fw ${data.unlockedfit ? "fa-lock-open" : "fa-lock"}"></i></a>`);
    $(form).find('[name="texture.fit"]').closest('.form-group').find('> label').append(unlockedFitLink);
    $(unlockedFitLink).on("click", ()=>{
      token.setFlag(MODULENAME, "unlockedfit", !data.unlockedfit);
    });
    if (!data.unlockedfit) {
      $(form).find('[name="texture.fit"]').prop("readonly", true);
    }

    // additional spritesheet-specific configurations
    data.showframes = SHEET_STYLE?.frames === undefined;
    data.showidle = game.settings.get(MODULENAME, "playIdleAnimations") && !data.separateidle;
    data.hide = !data.spritesheet || isPredefined;
    data.hideaux = !data.spritesheet;
    const rendered = $(await foundry.applications.handlebars.renderTemplate(`modules/${MODULENAME}/templates/token-settings.hbs`, data)).get(0);
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

    const scaleFormEl = form.querySelector("range-picker[name='scale'], input[name='scale']");
    if (updateScale && !!scaleFormEl) {
      scaleFormEl.value = data.scale ?? 1;
      const scaleFormLabel = $(scaleFormEl).next();
      if (scaleFormLabel.is(".range-value")) {
        scaleFormLabel.text(`${data.scale ?? 1}`);
      }
    }

    const texture = await foundry.canvas.loadTexture(src, {fallback: CONST.DEFAULT_TOKEN});
    const { width, height } = texture ?? {};
    if (!width || !height) return;
    const defaultRatio = SHEET_STYLE?.defaultRatio ?? (4 / data.animationframes);

    const ratio = (height / width) * defaultRatio;
    const scale = form.querySelector("range-picker[name='scale'], input[name='scale']")?.value ?? 1;
    const anchorY = (()=>{
      switch (data.sheetstyle) {
        case "pmd":
        case "eight": return 0.5;
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
 * When a token's spritesheet settings have been updated, re-render the token immediately.
 * The token object's _onUpdate method handles cache invalidation.
 * @param {*} token 
 * @param {*} changes 
 * @param {*} metadata 
 * @param {*} user 
 */
async function OnUpdateToken(token, changes, metadata, user) {
  // Check if any spritesheet-related properties changed
  const needsRedraw = changes?.texture?.src ||
                      changes?.flags?.[MODULENAME]?.sheetstyle ||
                      changes?.flags?.[MODULENAME]?.animationframes ||
                      changes?.flags?.[MODULENAME]?.spritesheet !== undefined;
  
  if (!needsRedraw) return;

  const tokenObj = token?.object;
  if (!tokenObj) return;

  // Trigger a full redraw - cache invalidation is handled by _onUpdate
  tokenObj.renderable = true;
  tokenObj.clear();
  await tokenObj.draw();
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
  if ((dx !== 0 || dy !== 0) && !options.teleport) { // && !game.settings.get("core", "tokenAutoRotate")) {
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
  switch (( 8 + Math.floor(((angle + 22.5) % 360) / 45) ) % 8) {
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


export function register() {
  Hooks.on("canvasConfig", ()=>{
    class SpritesheetToken extends NonPrivateTokenMixin(CONFIG.Token.objectClass) {
      #index;
      #textures;
      #textureSrc;
      #textureKey;
      #direction;
      #localOpacity;
      #idle;
      #run;

      constructor(document) {
        super(document);
        this.#initialize();
      }

      #initialize() {
        this.#localOpacity = 1;
        this.#idle = false;
        this.#run = false;
      }

      /** @override */
      clear() {
        super.clear();
        this.#index = 0;
        this.#textures = null;
        this.#textureSrc = null;
        this.#direction = "down";
      }

      get isSpritesheet() {
        return this.document.getFlag(MODULENAME, "spritesheet");
      }

      get sheetStyle() {
        return this.document.getFlag(MODULENAME, "sheetstyle") ?? "dlru";
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

      static RENDER_FLAGS = foundry.utils.mergeObject(super.RENDER_FLAGS, {
        refreshIndicators: {},
        refreshSize: { propagate: [...super.RENDER_FLAGS.refreshSize.propagate, "refreshIndicators"] },
        refreshShape: { propagate: [...super.RENDER_FLAGS.refreshShape.propagate, "refreshIndicators"] },
      })

      /** @override */
      async _draw(options) {
        // check if this token has a spritesheet configured
        if (!this.isSpritesheet) {
          await super._draw(options);
        } else {
          this._PRIVATE_cleanData();

          // Load token texture
          await this.playFromSpritesheet();
      
          // Cache token ring subject texture if needed
          // const ring = this.document.ring;
          // if ( ring.enabled && ring.subject.texture ) await foundry.canvas.loadTexture(ring.subject.texture);
      
      
          // Draw the token's PrimarySpriteMesh in the PrimaryCanvasGroup
          this.mesh = canvas.primary.addToken(this);
      
          // Initialize token ring
          // this.#initializeRing();
      
          // Draw the border
          this.border ||= this.addChild(new PIXI.Graphics());
      
          // Draw the void of the token's PrimarySpriteMesh
          if ( !this.voidMesh ) {
            this.voidMesh = this.addChild(new PIXI.Container());
            this.voidMesh.updateTransform = () => {};
            this.voidMesh.render = renderer => this.mesh?._renderVoid(renderer);
          }
      
          // Draw the detection filter of the token's PrimarySpriteMesh
          if ( !this.detectionFilterMesh ) {
            this.detectionFilterMesh = this.addChild(new PIXI.Container());
            this.detectionFilterMesh.updateTransform = () => {};
            this.detectionFilterMesh.render = renderer => {
              if ( this.detectionFilter ) this._renderDetectionFilter(renderer);
            };
          }
      
          // Draw Token interface components
          this.bars ||= this.addChild(this._PRIVATE_drawAttributeBars());
          this.tooltip ||= this.addChild(this._PRIVATE_drawTooltip());
          this.effects ||= this.addChild(new PIXI.Container());
          this.targetArrows ||= this.addChild(new PIXI.Graphics());
          this.targetPips ||= this.addChild(new PIXI.Graphics());
          this.nameplate ||= this.addChild(this._PRIVATE_drawNameplate());
          this.sortableChildren = true;
      
          // Initialize and draw the ruler
          if ( this.ruler === undefined ) this.ruler = this._initializeRuler();
          if ( this.ruler ) await this.ruler.draw();
      
          // Add filter effects
          this._updateSpecialStatusFilterEffects();
      
          // Draw elements
          await this._drawEffects();
      
          // Initialize sources
          if ( !this.isPreview ) this.initializeSources();
        }

        // draw the indicators (caught/uncaught/etc)
        this.indicators ||= this.addChild(new PIXI.Container());
        await this._drawIndicators();
      }

      async playFromSpritesheet() {
        const genSpritesheetKey = SpritesheetGenerator.generateKey(this.document.texture.src, this.sheetStyle, this.animationFrames);
        if (this.#textures == null || this.#textureSrc !== this.document.texture.src || this.#textureKey !== genSpritesheetKey) {
          let texture;
          if ( this._original ) texture = this._original.texture?.clone();
          else texture = await foundry.canvas.loadTexture(this.document.texture.src, {fallback: CONST.DEFAULT_TOKEN});

          this.#textureSrc = this.document.texture.src;
          this.#textures = await game.modules.get(MODULENAME).api.spritesheetGenerator.getTexturesForToken(this, texture);
          this.#textureKey = genSpritesheetKey;
        }
        this.#updateDirection();
        this.texture = this.#getTexture();
      }

      get isometric() {
        return game.modules.get("isometric-perspective")?.active && tokenScene(this.document)?.flags?.["isometric-perspective"]?.isometricEnabled;
      }

      get direction() {
        return this.#direction;
      }

      #getTextureList() {
        if (!this.isSpritesheet || this.#textures == null) return null;
        const facing = (()=>{
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
        })();
        const animation = (()=>{
          if (this.#idle && !this.separateIdle && this.#textures[`idle${facing}`] !== undefined) {
            return `idle${facing}`;
          }
          if (this.#run && this.#textures[`run${facing}`] !== undefined) {
            return `run${facing}`;
          }
          return facing;
        })();
        return this.#textures[animation];
      }

      #getTexture() {
        const textureList = this.#getTextureList();
        if (!textureList) return null;
        const index = (()=>{
          const framesInAnimation = textureList.length;
          if (this.#idle && this.separateIdle) {
            return 0;
          }
          const idxOffset = this.separateIdle ? 1 : 0;
          return idxOffset + ( this.#index % (framesInAnimation - idxOffset) );
        })();
        return textureList[index];
      }

      set direction(value) {
        this.#direction = value;
        if (this.#textures != null) {
          this.texture = this.#getTexture();
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

      _canDrag() {
        try {
          const scene = this?.document?.parent;
          const hasCombat = getCombatsForScene(scene?.uuid).length > 0;
          if (!game.user.isGM && (scene.getFlag(MODULENAME, "disableDrag") && !(scene.getFlag(MODULENAME, "outOfCombat") && hasCombat)))
            return false;
        } catch { }
        return super._canDrag();
      }

      #updateDirection() {
        this.#direction = getDirectionFromAngle(this.document.rotation);
      }

      /**
       * Refresh the rotation.
       * @protected
       */
      _refreshRotation() {
        if (!this.isSpritesheet) return super._refreshRotation();

        this.mesh.angle = 0;
        this.#updateDirection();
        this.#index = 0;
        if (this.#textures != null) {
          this.texture = this.#getTexture();
          if (this.mesh.texture != this.texture) {
            this.mesh.texture = this.texture;
            this.renderFlags.set({
              refreshMesh: true,
            });
          }
        }
      }

      /**
       * Animate from the old to the new state of this Token.
       * @param {Partial<TokenAnimationData>} to    The animation data to animate to
       * @param {TokenAnimationOptions} options     The options that configure the animation behavior
       * @param {boolean} chained                   Is this animation being chained to the current context?
       * @returns {Promise<void>}                   A promise which resolves once the animation has finished or stopped
       */
      _PRIVATE_animate(to, options, chained) {
        // Check if this is a movement animation (not just an idle frame animation)
        const isMovement = (to.x !== undefined) || (to.y !== undefined) || (to.rotation !== undefined && to.frame === undefined);
        
        // Terminate only idle frame animations when movement starts
        if (isMovement && !chained && this.#idle) {
          // Find and stop only idle animations (frame-only)
          for (const [name, context] of this.animationContexts.entries()) {
            // Check if this is a frame-only animation (idle)
            if (context.to && context.to.frame !== undefined && !context.to.x && !context.to.y) {
              CanvasAnimation.terminateAnimation(name);
              this.animationContexts.delete(name);
            }
          }
          this.#idle = false;
        }
        
        let from = this._PRIVATE_animationData;
        from.frame = 0;
        options.movementSpeed ??= (()=>{
          let desiredSpeed = 4; // default walk speed

          if (this.document._sliding) {
            this.#run = false;
            desiredSpeed = game.settings.get(MODULENAME, "walkSpeed") ?? 4;
          } else {
            const { sizeX, sizeY } = game?.scenes?.active?.grid ?? { sizeX: 100, sizeY: 100 };
            const manhattan = (Math.abs((to.x ?? from.x) - from.x) / sizeX) + (Math.abs((to.y ?? from.y) - from.y) / sizeY);
            if (manhattan != 0 && manhattan < (game.settings.get(MODULENAME, "runDistance") ?? 5)) {
              this.#run = false;
              desiredSpeed = game.settings.get(MODULENAME, "walkSpeed") ?? 4;
            } else if (manhattan != 0) {
              this.#run = true;
              desiredSpeed = game.settings.get(MODULENAME, "runSpeed") ?? 8;
            }
          }
          const multiplier = options.follower_speed_modifiers?.[this.document.id] ?? 1;
          return desiredSpeed * multiplier;
        })();

        this._origin = {
          x: this.x,
          y: this.y,
        };

        return super._PRIVATE_animate(to, options, chained).finally(()=>{
          if (!this.isSpritesheet) return;
          // start the idle animation
          if (this.animationContexts.size == 0) this.startIdleAnimation();
        });
      }

      _getAnimationRotationSpeed() {
        return Number.POSITIVE_INFINITY; // don't animate rotation
      }

      get idleAnimationDuration() {
        return game.settings.get(MODULENAME, "idleAnimTime") ?? 600;
      }

      startIdleAnimation() {
        if (this.destroyed) return;
        this.#idle = true;
        const fia = this.#getTextureList()?.length ?? 0;
        if (fia <= 1) return;
        const iad = this.idleAnimationDuration;
        if (iad <= 0) return;
        if (this.alwaysIdle) {
          this.animate({ frame: fia }, { duration: fia * iad });
        }
      }

      /**
       * Prepare the animation data changes: performs special handling required for animating rotation.
       * @param {DeepReadonly<TokenAnimationData>} from             The animation data to animate from
       * @param {Partial<TokenAnimationData>} changes               The animation data changes
       * @param {Omit<TokenAnimationContext, "promise">} context    The animation context
       * @param {TokenAnimationOptions} options                     The options that configure the animation behavior
       * @returns {CanvasAnimationAttribute[]}                      The animation attributes
       * @protected
       */
      _prepareAnimation(from, changes, context, options) {
        if (!this.isSpritesheet) return super._prepareAnimation(from, changes, context, options);
        const attributes = [];

        // TODO: handle teleportation
        SpritesheetToken._PRIVATE_handleRotationChanges(from, changes);
        // this._PRIVATE_handleTransitionChanges(changes, context, options, attributes);

        // Create animation attributes from the changes
        const recur = (changes, parent) => {
          for ( const [attribute, to] of Object.entries(changes) ) {
            const type = foundry.utils.getType(to);
            if ( type === "Object" ) recur(to, parent[attribute]);
            else if ( type === "number" || type === "Color" ) attributes.push({attribute, parent, to});
          }
        };
        recur(changes, this._PRIVATE_animationData);
        return attributes;
      }

      _getAnimationData() {
        return {
          ...super._getAnimationData(),
          frame: 0,
        }
      }

      _onAnimationUpdate(changed, context) {
        const irrelevant = !["x", "y", "rotation", "frame"].some(p=>foundry.utils.hasProperty(changed, p));
        if (irrelevant || !this.isSpritesheet || this.#textures == null) return super._onAnimationUpdate(changed, context);

        // get tile size
        const { sizeX, sizeY } = game?.scenes?.active?.grid ?? { sizeX: 100, sizeY: 100 };

        const FRAMES_PER_SQUARE = 2;
        const gdx = Math.abs((changed.x ?? this._origin?.x ?? 0) - (this._origin?.x ?? 0)) * FRAMES_PER_SQUARE / sizeX;
        const gdy = Math.abs((changed.y ?? this._origin?.y ?? 0) - (this._origin?.y ?? 0)) * FRAMES_PER_SQUARE / sizeY;
        const frame = changed.frame !== undefined ? ~~changed.frame : ~~(gdx + gdy - (Math.min(gdx, gdy) / 2));

        // set the direction
        const dx = (context?.to?.x ?? changed.x ?? 0) - (changed.x ?? context?.to?.x ?? 0);
        const dy = (context?.to?.y ?? changed.y ?? 0) - (changed.y ?? context?.to?.y ?? 0);
        if (changed.frame != undefined) { // idle animation
          this.#idle = true;
          if (changed.rotation != undefined) {
            this.#direction = getDirectionFromAngle(changed.rotation);
          } else if (dx != 0 || dy != 0) {
            this.#direction = getDirection(dx, dy);
            this.#idle = false;
          }
          this.#index = frame;
        } else if (this._spinning && (dx != 0 || dy != 0)) { // spinning animation
          this.#idle = false;
          this.#index = 0;
          this.#direction = ["down", "right", "up", "left"][frame % 4];
        } else if (dx != 0 || dy != 0) {  // normal animation
          this.#idle = false;
          this.#direction = getDirectionFromAngle(changed.rotation ?? this.document.rotation);
          this.#index = frame;
        } else {
          this.#idle = true;
          this.#direction = getDirectionFromAngle(changed.rotation ?? this.document.rotation);
          this.#index = 0; // no movement, reset to first frame
        }

        if (this.document._sliding) { // slide with one leg out
          this.#index = 1;
        }

        const newTexture = this.#getTexture();
        if (this.mesh.texture != newTexture) {
          this.mesh.texture = newTexture;
          this.renderFlags.set({
            refreshMesh: true,
          });
        }
        return super._onAnimationUpdate(changed, context);
      }

      /**
       * 
       */
      async _drawIndicators() {
        this.indicators.renderable = false;

        // clear caught indicator
        this.indicators.removeChildren().forEach(c => c.destroy());

        // TODO: add a way for other modules to add indicators here

        this.indicators.sortChildren();
        this.indicators.renderable = true;
        this.renderFlags.set({refreshIndicators: true});
      }

      /**
       * Refresh the display of the indicators, adjusting its position for the token width and height.
       * @protected
       */
      _refreshIndicators() {
        const s = canvas.dimensions.uiScale;
        let i = 0;
        const size = 20 * s;
        const rows = Math.floor((this.document.getSize().height / size) + 1e-6);

        // move it to the top-right corner
        this.indicators.transform.position.x = this.document.getSize().width - size;
        this.indicators.alpha = 0.75;

        for ( const effect of this.indicators.children ) {
          effect.width = effect.height = size;
          effect.x = Math.floor(i / rows) * (-size);
          effect.y = (i % rows) * size;
          i++;
        }
      }

      _applyRenderFlags(flags) {
        super._applyRenderFlags(flags);
        if ( flags.refreshIndicators ) this._refreshIndicators();
      }

      /**
       * Move the token immediately to the destination if it is teleported.
       * @param {Partial<TokenAnimationData>} to    The animation data to animate to
       */
      _handleTeleportAnimation(to) {
        const changes = {};
        if ( "x" in to ) this._PRIVATE_animationData.x = changes.x = to.x;
        if ( "y" in to ) this._PRIVATE_animationData.y = changes.y = to.y;
        if ( "elevation" in to ) this._PRIVATE_animationData.elevation = changes.elevation = to.elevation;
        if ( !foundry.utils.isEmpty(changes) ) {
          const context = {name: Symbol(this.animationName), to: changes, duration: 0, time: 0,
            preAnimate: [], postAnimate: [], onAnimate: []};
          this._onAnimationUpdate(changes, context);
        }
      }


      /** @inheritDoc */
      _onUpdate(changed, options, userId) {
        super._onUpdate(changed, options, userId);
        
        if ("hidden" in changed && !changed.hidden) {
          this.#localOpacity = 1;
        }
        
        // Invalidate cached textures when spritesheet configuration changes
        const needsTextureRefresh = changed.flags?.[MODULENAME]?.spritesheet !== undefined ||
                                    changed.flags?.[MODULENAME]?.sheetstyle !== undefined ||
                                    changed.flags?.[MODULENAME]?.animationframes !== undefined;
        
        if (needsTextureRefresh) {
          this.#textures = null;
          this.#textureSrc = null;
          this.#textureKey = null;
          this.renderable = true;
          this.initializeSources();
        }
      }

      /* -------------------------------------------- */
      /* Token Movement and Collision Methods         */
      /* -------------------------------------------- */

      /** @inheritDoc */
      findMovementPath(waypoints, options) {
        // Normal behavior if movement automation is disabled
        if (!game.settings.get(MODULENAME, "tokenCollision")) {
          return super.findMovementPath(waypoints, options);
        }

        // Get all grid spaces as waypoints so that running into a blocking token stops us immediately before it
        waypoints = this.document.getCompleteMovementPath(waypoints);

        // Drop all intermediate waypoints except those immediately before a blocking token
        const grid = this.document.parent.grid;
        waypoints = waypoints.filter((waypoint, i) => {
          return !waypoint.intermediate || this.layer.isOccupiedGridSpaceBlocking(grid.getOffset(waypoints[i + 1]), this);
        });
        return super.findMovementPath(waypoints, options);
      }

      /* -------------------------------------------- */

      /** @inheritDoc */
      _getDragConstrainOptions() {
        const unconstrainedMovement = game.user.isGM
          && ui.controls.controls.tokens?.tools.unconstrainedMovement?.active;
        return { ...super._getDragConstrainOptions(), ignoreTokens: unconstrainedMovement };
      }

      /* -------------------------------------------- */

      /** @inheritDoc */
      constrainMovementPath(waypoints, options) {
        let { preview=false, ignoreTokens=false } = options; // Custom constrain option to ignore tokens

        ignoreTokens ||= !game.settings.get(MODULENAME, "tokenCollision");

        // Ignore tokens if path contains resize
        ignoreTokens ||= waypoints.some(w => (w.width !== waypoints[0].width) || (w.height !== waypoints[0].height));

        if (ignoreTokens) return super.constrainMovementPath(waypoints, options);

        // Ignore preview if token vision is disabled or the current user is a GM
        if (!canvas.visibility.tokenVision || game.user.isGM) preview = false;

        let path = waypoints;
        let constrained = false;

        for (let k = 0; k < 10; k++) {

          // Apply blocking constraints
          const completePath = this.document.getCompleteMovementPath(path);
          let blockedIndex;
          for (let i = 1; i < completePath.length; i++) {
            const waypoint = completePath[i];
            const occupiedGridSpaces = this.document.getOccupiedGridSpaceOffsets(waypoint);
            const elevationOffset = Math.floor((waypoint.elevation / canvas.grid.distance) + 1e-8);
            if (occupiedGridSpaces.some(space =>
              this.layer.isOccupiedGridSpaceBlocking({...space, k: elevationOffset}, this, {preview}))
            ) {
              blockedIndex = i;
              break;
            }
          }
          const blocked = blockedIndex >= 1;
          if (blocked) {
            path = completePath.slice(0, blockedIndex - 1).filter(waypoint => !waypoint.intermediate);
            path.push(completePath.at(blockedIndex - 1));
            constrained = true;
          }

          // Test wall/cost constraints in the first iteration always and in later
          // iterations only if the path changed due to blocking
          if ((k === 0) || blocked) {
            const [constrainedPath, wasConstrained] = super.constrainMovementPath(path, options);
            path = constrainedPath;
            if (!wasConstrained) return [path, constrained]; // No change: path is valid
            constrained = true;
          }

          // In a later iteration if there was no change due to blocking, we found a valid path
          else if (!blocked) return [path, constrained];
        }

        // After 10 failed attempts to find a valid path, remove the last waypoints and constrain this path
        [path] = this.constrainMovementPath(waypoints.slice(0, -1), options);
        return [path, true];
      }

      /* -------------------------------------------- */

      /** @inheritDoc */
      _onDelete(options, userId) {
        super._onDelete(options, userId);
      }

    };

    CONFIG.Token.objectClass = SpritesheetToken;

    Object.defineProperty(CONFIG.Token.documentClass.prototype, "movable", {
      get() {
        return (this._movementLocks?.size ?? 0) === 0;
      }
    });
  });

  Hooks.on("renderTokenConfig", OnRenderTokenConfig);
  Hooks.on("renderPrototypeTokenConfig", OnRenderTokenConfig);
  Hooks.on("updateToken", OnUpdateToken);
  Hooks.on("preUpdateToken", OnPreUpdateToken);
  if (early_isGM()) {
    Hooks.on("createCombatant", OnCreateCombatant);
  }
}