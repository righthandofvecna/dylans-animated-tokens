const { PointMovementSource } = foundry.canvas.sources;
const { PreciseText } = foundry.canvas.containers;
const { PrimarySpriteMesh } = foundry.canvas.primary;
const { PlaceableObject } = foundry.canvas.placeables;
const { Ray } = foundry.canvas.geometry;
const { CanvasAnimation } = foundry.canvas.animation;
const { PrimaryCanvasGroup } = foundry.canvas.groups;
const { InvisibilityFilter } = foundry.canvas.rendering.filters;
const { loadTexture } = foundry.canvas;
const { REGION_MOVEMENT_SEGMENTS } = CONST;

export function NonPrivateTokenMixin(TokenClass) {
  return class NonPrivateToken extends TokenClass {
  /**
   *
   * @param {TokenDocument} document   The TokenDocument that this Token represents
   */
  constructor(document) {
    super(document);
    this._PRIVATE_initialize();
  };

  /**
   * Used in {@link Token_PRIVATE__renderDetectionFilter}.
   * @type {[detectionFilter: PIXI.Filter|null]}
   */
  static _PRIVATE_DETECTION_FILTER_ARRAY = [null];

  /**
   * The center point adjustment. See {@link Token_PRIVATE_getMovementAdjustedPoint}.
   * @type {Point}
   */
  _PRIVATE_centerOffset;

  /**
   * The animated center point adjustment.
   * @type {Point}
   */
  _PRIVATE_animationCenterOffset;

  /**
   * The Token central coordinate, adjusted for its most recent movement vector.
   * @type {Point}
   */
  _PRIVATE_adjustedCenter;

  /**
   * A flag to capture whether this Token has an unlinked video texture.
   * @type {boolean}
   */
  _PRIVATE_unlinkedVideo = false;

  /**
   * The current animation data of this Token.
   * @type {TokenAnimationData}
   */
  _PRIVATE_animationData;

  /**
   * The prior animation data of this Token.
   * @type {TokenAnimationData}
   */
  _PRIVATE_priorAnimationData;

  /**
   * A map of effects id and their filters applied on this token placeable.
   * @type {Map<string, AbstractBaseFilter>}
   */
  _PRIVATE_filterEffects = new Map();

  /**
   * The current animations of this Token.
   * @type {Map<string, TokenAnimationContext>}
   */
  get animationContexts() {
    return this._PRIVATE_animationContexts;
  };

  _PRIVATE_animationContexts = new Map();

  /**
   * The general animation name used for this Token.
   * @type {string}
   */
  get animationName() {
    return this._PRIVATE_animationName ??= `${this.objectId}.animate`;
  };

  _PRIVATE_animationName;

  /**
   * The animation name used to animate this Token's movement.
   * @type {string}
   */
  get movementAnimationName() {
    return this._PRIVATE_movementAnimationName ??= `${this.objectId}.animateMovement`;
  };

  _PRIVATE_movementAnimationName;

  /**
   * The promise of the current movement animation chain of this Token
   * or null if there isn't a movement animation in progress.
   * @type {Promise<void>|null}
   */
  get movementAnimationPromise() {
    const context = this._PRIVATE_animationContexts.get(this.movementAnimationName);
    if ( !context ) return null;
    return context.chain.at(-1)?.promise ?? context.promise;
  };

  /**
   * Should the ruler of this Token be visible?
   * @type {boolean}
   */
  get showRuler() {
    if ( this._PRIVATE_showRuler ) return true;
    for ( const [userId, {hidden}] of Object.entries(this._plannedMovement) ) {
      if ( !hidden || (userId === game.user.id) ) return true;
    }
    return false;
  };

  _PRIVATE_showRuler;

  /**
   * A TokenRing instance which is used if this Token applies a dynamic ring.
   * This property is null if the Token does not use a dynamic ring.
   * @type {TokenRing|null}
   */
  get ring() {
    return this._PRIVATE_ring;
  };

  _PRIVATE_ring;

  /* -------------------------------------------- */
  /*  Initialization                              */
  /* -------------------------------------------- */

  /**
   * Establish an initial velocity of the token based on its direction of facing.
   * Assume the Token made some prior movement towards the direction that it is currently facing.
   */
  _PRIVATE_initialize() {

    // Initialize prior movement
    const {x, y, rotation} = this.document;
    const r = Ray.fromAngle(x, y, Math.toRadians(rotation + 90), canvas.dimensions.size);

    // Initialize valid position
    this._PRIVATE_centerOffset = {x: Math.sign(r.dx), y: Math.sign(r.dy)};
    this._PRIVATE_animationCenterOffset = {x: this._PRIVATE_centerOffset.x, y: this._PRIVATE_centerOffset.y};
    this._PRIVATE_adjustedCenter = this.getMovementAdjustedPoint(this.document.getCenterPoint());

    // Initialize animation data
    this._PRIVATE_animationData = foundry.utils.deepSeal(this._getAnimationData());
    this._PRIVATE_priorAnimationData = foundry.utils.deepSeal(foundry.utils.deepClone(this._PRIVATE_animationData));
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  clone() {
    const clone = super.clone();
    clone._PRIVATE_centerOffset.x = clone._PRIVATE_animationCenterOffset.x = this._PRIVATE_centerOffset.x;
    clone._PRIVATE_centerOffset.y = clone._PRIVATE_animationCenterOffset.y = this._PRIVATE_centerOffset.y;
    clone._PRIVATE_adjustedCenter = clone.getMovementAdjustedPoint(clone.document.getCenterPoint());
    return clone;
  };

  /* -------------------------------------------- */

  /**
   * Initialize a TokenRing instance for this Token, if a dynamic ring is enabled.
   */
  _PRIVATE_initializeRing() {

    // Construct a TokenRing instance
    if ( this.document.ring.enabled ) {
      if ( !this.hasDynamicRing ) {
        const cls = CONFIG.Token.ring.ringClass;
        if ( !foundry.utils.isSubclass(cls, TokenRing) ) {
          throw new Error("The configured CONFIG.Token.ring.ringClass is not a TokenRing subclass.");
        }
        this._PRIVATE_ring = new cls(this);
      }
      this._PRIVATE_ring.configure(this.mesh);
      return;
    }

    // Deactivate a prior TokenRing instance
    if ( this.hasDynamicRing ) this._PRIVATE_ring.clear();
    this._PRIVATE_ring = null;
  };

  /* -------------------------------------------- */

  /**
   * The Token's central position, adjusted in each direction by one or zero pixels to offset it relative to walls.
   * @overload
   * @param {ElevatedPoint} point The center point with elevation.
   * @param {object} [options]
   * @param {number} [options.offsetX] The x-offset.
   * @param {number} [options.offsetY] The y-offset.
   * @returns {ElevatedPoint} The adjusted center point.
   */
  /**
   * @overload
   * @param {Point} point The center point.
   * @param {object} [options]
   * @param {number} [options.offsetX] The x-offset.
   * @param {number} [options.offsetY] The y-offset.
   * @returns {Point} The adjusted center point.
   */
  getMovementAdjustedPoint(point, {offsetX, offsetY}={}) {
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    const elevation = point.elevation;
    point = elevation !== undefined ? {x, y, elevation} : {x, y};
    offsetX ??= this._PRIVATE_centerOffset?.x || 0;
    offsetY ??= this._PRIVATE_centerOffset?.y || 0;
    if ( (offsetX === 0) && (offsetY === 0) ) return point;

    // Define a bounding box around the point to query relevant edges using the Quadtree
    const bounds = new PIXI.Rectangle(point.x, point.y, 0, 0);

    // Define a collisionTest that returns only edges that block movement and are collinear with the point.
    const collisionTest = edge => (edge.move && (foundry.utils.orient2dFast(edge.a, edge.b, point) === 0));

    // Retrieve candidate edges. Include inner bounds.
    const size = canvas.edges.getEdges(bounds, {
      includeInnerBounds: true,
      includeOuterBounds: false,
      collisionTest
    }).size;

    // If at least one collinear, blocking edge is found, offset the point.
    if ( size > 0 ) {
      point.x -= offsetX;
      point.y -= offsetY;
    }
    return point;
  };

  /* -------------------------------------------- */

  /**
   * Is this Token currently being dragged?
   * @type {boolean}
   */
  get isDragged() {
    return !!this._PRIVATE_getDragContext();
  };

  /* -------------------------------------------- */

  /**
   * Update the light and vision source objects associated with this Token.
   * @param {object} [options={}]       Options which configure how perception sources are updated
   * @param {boolean} [options.deleted=false]       Indicate that this light and vision source has been deleted
   */
  initializeSources({deleted=false}={}) {
    this._PRIVATE_adjustedCenter = this.getMovementAdjustedPoint(this.document.getCenterPoint(),
      this._PRIVATE_animationCenterOffset);
    this.initializeLightSource({deleted});
    this.initializeVisionSource({deleted});
  };

  /* -------------------------------------------- */

  /**
   * Update an emitted light source associated with this Token.
   * @param {object} [options={}]
   * @param {boolean} [options.deleted]    Indicate that this light source has been deleted.
   */
  initializeLightSource({deleted=false}={}) {
    // Gather current state
    const sourceId = this.sourceId;
    const wasLight = canvas.effects.lightSources.has(sourceId);
    const wasDarkness = canvas.effects.darknessSources.has(sourceId);
    const previousPriority = this.lightSource?.priority ?? 0;
    const actualPriority = this.document.light.priority ?? 0;
    const isDarkness = this.document.light.negative;
    const perceptionFlags = {
      refreshEdges: wasDarkness || isDarkness,
      initializeVision: wasDarkness || isDarkness,
      initializeLighting: wasDarkness || isDarkness,
      refreshLighting: true,
      refreshVision: true
    };

    // Did the lightsource previously create edges?
    const edgesBefore = wasDarkness || (wasLight && (previousPriority > 0));

    // Should the lightsource create edges now?
    const edgesNow = isDarkness || (actualPriority > 0);

    // Check for key changes
    const darknessChanged = (wasDarkness !== isDarkness);
    const priorityChanged = (previousPriority !== actualPriority);
    const edgesChanged = (edgesBefore !== edgesNow);
    const fullUpdate = darknessChanged || edgesChanged || priorityChanged;

    // Handle deletion
    if ( deleted || !this._isLightSource() ) {
      if ( !this.light ) return;
      if ( this.light.active ) canvas.perception.update(perceptionFlags);
      this._PRIVATE_destroyLightSource();
      return;
    }

    // Otherwise handle potential recreation
    if ( fullUpdate ) this._PRIVATE_destroyLightSource();

    // Create a light source if necessary
    this.light ??= this._PRIVATE_createLightSource();

    // Re-initialize source data and add to the active collection
    this.light.initialize(this._getLightSourceData());
    this.light.add();

    // If darkness or edges changed, we need a full edge-based refresh
    if ( fullUpdate ) {
      perceptionFlags.refreshEdges = perceptionFlags.initializeVision = perceptionFlags.initializeLighting = true;
    }

    // Update perception and rendering
    canvas.perception.update(perceptionFlags);
  };

  /* -------------------------------------------- */

  /**
   * Get the light source data.
   * @returns {LightSourceData}
   * @protected
   */
  _getLightSourceData() {
    const {x, y} = this._PRIVATE_adjustedCenter;
    const {elevation, rotation} = this.document;
    const lightDoc = this.document.light;
    return foundry.utils.mergeObject(lightDoc.toObject(false), {
      x, y, elevation, rotation,
      dim: this.getLightRadius(lightDoc.dim),
      bright: this.getLightRadius(lightDoc.bright),
      externalRadius: this.externalRadius,
      seed: this.document.getFlag("core", "animationSeed"),
      preview: this.isPreview,
      disabled: !this._isLightSource() || this._PRIVATE_isUnreachableDragPreview
    });
  };

  /* -------------------------------------------- */

  /**
   * Update the VisionSource instance associated with this Token.
   * @param {object} [options]        Options which affect how the vision source is updated
   * @param {boolean} [options.deleted]   Indicate that this vision source has been deleted.
   */
  initializeVisionSource({deleted=false}={}) {

    // Remove a deleted vision source from the active collection
    if ( deleted || !this._isVisionSource() ) {
      if ( !this.vision ) return;
      if ( this.vision.active ) canvas.perception.update({
        initializeVisionModes: true,
        refreshVision: true,
        refreshLighting: true
      });
      this._PRIVATE_destroyVisionSource();
      return;
    }

    // Create a vision source if necessary
    const wasVision = !!this.vision;
    this.vision ??= this._PRIVATE_createVisionSource();

    // Re-initialize source data
    const previousActive = this.vision.active;
    const previousVisionMode = this.vision.visionMode;
    const blindedStates = this._getVisionBlindedStates();
    for ( const state in blindedStates ) this.vision.blinded[state] = blindedStates[state];
    this.vision.initialize(this._getVisionSourceData());
    this.vision.add();
    canvas.perception.update({
      initializeVisionModes: !wasVision
        || (this.vision.active !== previousActive)
        || (this.vision.visionMode !== previousVisionMode),
      refreshVision: true,
      refreshLighting: true
    });
  };

  /* -------------------------------------------- */

  /**
   * Get the vision source data.
   * @returns {VisionSourceData}
   * @protected
   */
  _getVisionSourceData() {
    const {x, y} = this._PRIVATE_adjustedCenter;
    const {elevation, rotation} = this.document;
    const sight = this.document.sight;
    return {
      x, y, elevation, rotation,
      radius: this.sightRange,
      lightRadius: this.lightPerceptionRange,
      externalRadius: this.externalRadius,
      angle: sight.angle,
      contrast: sight.contrast,
      saturation: sight.saturation,
      brightness: sight.brightness,
      attenuation: sight.attenuation,
      visionMode: sight.visionMode,
      color: sight.color,
      preview: this.isPreview,
      disabled: this._PRIVATE_isUnreachableDragPreview
    };
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * Render the bound mesh detection filter.
   * Note: this method does not verify that the detection filter exists.
   * @param {PIXI.Renderer} renderer
   * @protected
   */
  _renderDetectionFilter(renderer) {
    if ( !this.mesh ) return;

    NonPrivateToken._PRIVATE_DETECTION_FILTER_ARRAY[0] = this.detectionFilter;

    // Rendering the mesh
    const originalFilters = this.mesh.filters;
    const originalTint = this.mesh.tint;
    const originalAlpha = this.mesh.worldAlpha;
    this.mesh.filters = NonPrivateToken._PRIVATE_DETECTION_FILTER_ARRAY;
    this.mesh.tint = 0xFFFFFF;
    this.mesh.worldAlpha = 1;
    this.mesh.pluginName = BaseSamplerShader.classPluginName;
    this.mesh.render(renderer);
    this.mesh.filters = originalFilters;
    this.mesh.tint = originalTint;
    this.mesh.worldAlpha = originalAlpha;
    this.mesh.pluginName = null;

    NonPrivateToken._PRIVATE_DETECTION_FILTER_ARRAY[0] = null;
  };

  /* -------------------------------------------- */

  /** @override */
  clear() {
    this.ruler?.clear();
    if ( this.mesh ) {
      this.mesh.texture = PIXI.Texture.EMPTY;
      this.mesh.visible = false;
    }
    if ( this._PRIVATE_unlinkedVideo ) this.texture?.baseTexture?.destroy(); // Destroy base texture if the token has an unlinked video
    this._PRIVATE_unlinkedVideo = false;
    if ( this.hasActiveHUD ) this.layer.hud.close();
    return this;
  };

  /* -------------------------------------------- */

  /** @inheritdoc */
  _destroy(options) {
    this._PRIVATE_cancelDrag();
    this._removeAllFilterEffects();
    this.stopAnimation();                       // Cancel movement animations
    canvas.primary.removeToken(this);           // Remove the PrimarySpriteMesh from the PrimaryCanvasGroup
    this._PRIVATE_destroyLightSource();                 // Destroy the LightSource
    this._PRIVATE_destroyVisionSource();                // Destroy the VisionSource
    this.ruler?.destroy();                      // Destroy the ruler
    if ( this._PRIVATE_unlinkedVideo ) this.texture?.baseTexture?.destroy();  // Destroy base texture if the token has an unlinked video
    if ( this.turnMarker ) canvas.tokens.turnMarkers.delete(this); // Unregister active turn marker
    this.removeChildren().forEach(c => c.destroy({children: true}));
    this.texture = undefined;
    this._PRIVATE_unlinkedVideo = false;
  };

  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this._PRIVATE_cleanData();

    // Load token texture
    let texture;
    if ( this._original ) texture = this._original.texture?.clone();
    else texture = await loadTexture(this.document.texture.src, {fallback: CONST.DEFAULT_TOKEN});

    // Cache token ring subject texture if needed
    const ring = this.document.ring;
    if ( ring.enabled && ring.subject.texture ) await loadTexture(ring.subject.texture);

    // Manage video playback
    let video = game.video.getVideoSource(texture);
    this._PRIVATE_unlinkedVideo = !!video && !this._original;
    if ( this._PRIVATE_unlinkedVideo ) {
      texture = await game.video.cloneTexture(video);
      video = game.video.getVideoSource(texture);
      const playOptions = {volume: 0};
      if ( (this.document.getFlag("core", "randomizeVideo") !== false) && Number.isFinite(video.duration) ) {
        playOptions.offset = Math.random() * video.duration;
      }
      game.video.play(video, playOptions);
    }
    this.texture = texture;

    // Draw the token's PrimarySpriteMesh in the PrimaryCanvasGroup
    this.mesh = canvas.primary.addToken(this);

    // Initialize token ring
    this._PRIVATE_initializeRing();

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
  };

  /* -------------------------------------------- */

  /**
   * Create a point light source according to token options.
   * @returns {PointDarknessSource|PointLightSource}
   */
  _PRIVATE_createLightSource() {
    const lightSourceClass = this.document.light.negative
      ? CONFIG.Canvas.darknessSourceClass : CONFIG.Canvas.lightSourceClass;
    return new lightSourceClass({sourceId: this.sourceId, object: this});
  };

  /* -------------------------------------------- */

  /**
   * Destroy the PointLightSource or PointDarknessSource instance associated with this Token.
   */
  _PRIVATE_destroyLightSource() {
    this.light?.destroy();
    this.light = undefined;
  };

  /* -------------------------------------------- */

  /**
   * Create a point vision source for the Token.
   * @returns {PointVisionSource}
   */
  _PRIVATE_createVisionSource() {
    return new CONFIG.Canvas.visionSourceClass({sourceId: this.sourceId, object: this});
  };

  /* -------------------------------------------- */

  /**
   * Destroy the PointVisionSource instance associated with this Token.
   */
  _PRIVATE_destroyVisionSource() {
    this.vision?.visionMode?.deactivate(this.vision);
    this.vision?.destroy();
    this.vision = undefined;
  };

  /* -------------------------------------------- */

  /**
   * Apply initial sanitizations to the provided input data to ensure that a Token has valid required attributes.
   * Constrain the Token position to remain within the Canvas rectangle.
   */
  _PRIVATE_cleanData() {
    const d = this.scene.dimensions;
    const {x: cx, y: cy} = this.document.getCenterPoint({x: 0, y: 0});
    this.document.x = Math.clamp(this.document.x, -cx, d.width - cx);
    this.document.y = Math.clamp(this.document.y, -cy, d.height - cy);
  };

  /* -------------------------------------------- */

  /**
   * Draw resource bars for the Token
   * @returns {PIXI.Container}
   */
  _PRIVATE_drawAttributeBars() {
    const bars = new PIXI.Container();
    bars.bar1 = bars.addChild(new PIXI.Graphics());
    bars.bar2 = bars.addChild(new PIXI.Graphics());
    return bars;
  };

  /* -------------------------------------------- */

  /**
   * Refresh aspects of the user interaction state.
   * For example the border, nameplate, or bars may be shown on Hover or on Control.
   * @protected
   */
  _refreshState() {
    this.alpha = this._getTargetAlpha();
    this.border.tint = this._PRIVATE_getBorderColor();
    const isSecret = this.document.isSecret;
    const isHover = this.hover || this.layer.highlightObjects;
    this.border.zIndex = isHover ? Infinity : -1;
    this.border.visible = !isSecret && (this.controlled || isHover);
    this.nameplate.visible = !isSecret && this._canViewMode(this.document.displayName);
    this.bars.visible = !isSecret && (this.actor && this._canViewMode(this.document.displayBars));
    this.tooltip.visible = !isSecret;
    this.effects.visible = !isSecret;
    this.targetPips.visible = this.targetArrows.visible = !isSecret;
    this.cursor = !isSecret ? "pointer" : null;
    this.zIndex = this.mesh.zIndex = this.controlled ? 2 : this.hover ? 1 : 0;
    this.mesh.sort = this.document.sort;
    this.mesh.sortLayer = PrimaryCanvasGroup.SORT_LAYERS.TOKENS;
    this.mesh.alpha = this.alpha * this.document.alpha;
    this.mesh.hidden = this.document.hidden;
    if ( this.ruler ) this.ruler.visible = this.ruler.isVisible;
  };

  /* -------------------------------------------- */

  /**
   * Get the hex color that should be used to render the Token border
   * @returns {number}            The border color
   */
  _PRIVATE_getBorderColor() {
    let color = this._getBorderColor();
    /** @deprecated since v12 */
    if ( typeof color !== "number" ) {
      color = CONFIG.Canvas.dispositionColors.INACTIVE;
      const msg = "Token_PRIVATE__getBorderColor returning null is deprecated.";
      foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    }
    return color;
  };

  /* -------------------------------------------- */

  /**
   * Draw the targeting arrows around this token.
   * @param {ReticuleOptions} [reticule]  Additional parameters to configure how the targeting reticule is drawn.
   * @protected
   */
  _drawTargetArrows({margin: m=0, alpha=1, size, color, border: {width=2, color: lineColor=0}={}}={}) {
    size ??= CONFIG.Canvas.targeting.size;
    this.targetArrows.clear();

    // We don't show the target arrows for a secret token disposition, non-GM users or for other users.
    if ( !this.targeted.size || !this.targeted.has(game.user) ) return;

    const l = size * 100 * canvas.dimensions.uiScale; // Side length.
    const {h, w} = this;
    const lineStyle = {color: lineColor, alpha, width, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.BEVEL};
    color ??= this._PRIVATE_getBorderColor();
    m *= l * -1;
    this.targetArrows.beginFill(color, alpha).lineStyle(lineStyle)
      .drawPolygon([-m, -m, -m-l, -m, -m, -m-l]) // Top left
      .drawPolygon([w+m, -m, w+m+l, -m, w+m, -m-l]) // Top right
      .drawPolygon([-m, h+m, -m-l, h+m, -m, h+m+l]) // Bottom left
      .drawPolygon([w+m, h+m, w+m+l, h+m, w+m, h+m+l]); // Bottom right
  };

  /* -------------------------------------------- */

  /**
   * Draw the token's nameplate as a text object
   * @returns {PreciseText}    The Text object for the Token nameplate
   */
  _PRIVATE_drawNameplate() {
    const s = canvas.dimensions.uiScale;
    const nameplate = new PreciseText(this.document.name, this._getTextStyle());
    nameplate.anchor.set(0.5, 0);
    nameplate.scale.set(s, s);
    return nameplate;
  };

  /* -------------------------------------------- */

  /**
   * Draw a text tooltip for the token which can be used to display Elevation or a resource value
   * @returns {PreciseText}     The text object used to render the tooltip
   */
  _PRIVATE_drawTooltip() {
    const s = canvas.dimensions.uiScale;
    const tooltip = new PreciseText(this._getTooltipText(), this._getTextStyle());
    tooltip.anchor.set(0.5, 1);
    tooltip.scale.set(s, s);
    return tooltip;
  };

  /* -------------------------------------------- */

  /**
   * Animate from the old to the new state of this Token.
   * @param {Partial<TokenAnimationData>} to      The animation data to animate to
   * @param {TokenAnimationOptions} [options]     The options that configure the animation behavior
   * @returns {Promise<void>}                     A promise which resolves once the animation has finished or stopped
   */
  animate(to, options={}) {
    return this._PRIVATE_animate(to, options, false);
  };

  /* -------------------------------------------- */

  /**
   * Animate from the old to the new state of this Token.
   * @param {Partial<TokenAnimationData>} to    The animation data to animate to
   * @param {TokenAnimationOptions} options     The options that configure the animation behavior
   * @param {boolean} chained                   Is this animation being chained to the current context?
   * @returns {Promise<void>}                   A promise which resolves once the animation has finished or stopped
   */
  _PRIVATE_animate(to, options, chained) {

    /** @deprecated since v12 */
    if ( "a0" in options ) {
      const msg = "Passing a0 to Token_PRIVATE_animate is deprecated without replacement.";
      foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    }

    // Get the name and the from and to animation data
    let name = options.name;
    if ( name === undefined ) name = this.animationName;
    else name ||= Symbol(this.animationName);
    let from = this._PRIVATE_animationData;
    to = foundry.utils.filterObject(to, this._PRIVATE_animationData);
    let context = this._PRIVATE_animationContexts.get(name);

    // Use default options of movement action
    if ( TokenDocument._isMovementUpdate(to, from) ) {
      options = {...options};
      options.action ??= this.document.movementAction;
      const defaults = CONFIG.Token.movement.actions[options.action].getAnimationOptions(this);
      for ( const key in defaults ) options[key] ??= defaults[key];
    }

    let duration = options.duration;

    // Chain to exiting animation if requested
    if ( context && options.chain ) {

      // Get the animation duration ahead of time
      if ( duration === undefined ) {
        from = foundry.utils.mergeObject(from, context.to, {inplace: false});
        for ( const {to} of context.chain ) foundry.utils.mergeObject(from, to);
        const changes = foundry.utils.diffObject(from, to);
        duration = (foundry.utils.isEmpty(changes) ? 0 : this._getAnimationDuration(from, to, options));
      }

      let chainLink;
      const chainPromise = new Promise((resolve, reject) => {
        chainLink = {to, options: {...options, duration, chain: false}, promise: null, resolve, reject};
        context.chain.push(chainLink);
      });
      chainLink.promise = chainPromise;
      return chainPromise;
    }

    let chain;
    let time;

    // This animation was chained to the current context
    if ( chained ) {
      chain = context.chain;
      time = context.time - context.duration;
      this._PRIVATE_animationContexts.delete(name);
      for ( const fn of context.postAnimate ) fn(context);

      // Resolve current animation before the chained animation starts
      const animation = CanvasAnimation.getAnimation(name);
      animation?.resolve(true);
    }

    // Otherwise merge into existing animation if there is one
    else {
      if ( context ) to = foundry.utils.mergeObject(context.to, to, {inplace: false});

      // Conclude the current animation
      if ( context ) this._PRIVATE_animationContexts.delete(name);
      CanvasAnimation.terminateAnimation(name);
      if ( context ) {
        for ( const fn of context.postAnimate ) fn(context);
        for ( const {resolve} of context.chain ) resolve();
      }

      chain = [];
      time = 0;
    }

    // Compute animation data changes
    const changes = foundry.utils.diffObject(from, to);

    // Get the animation duration and create the animation context
    duration ??= (foundry.utils.isEmpty(changes) ? 0 : this._getAnimationDuration(from, to, options));
    let resolve;
    context = {name, chain, to, duration, time: 0, preAnimate: [], postAnimate: [], onAnimate: [],
      promise: new Promise(r => { resolve = r; })};

    // Set the animation context
    this._PRIVATE_animationContexts.set(name, context);

    // Prepare the animation data changes
    const attributes = this._prepareAnimation(from, changes, context, options);

    // Dispatch the animation
    const {easing, ontick} = options;
    CanvasAnimation.animate(attributes, {
      name,
      context: this,
      time,
      duration,
      easing,
      priority: PIXI.UPDATE_PRIORITY.OBJECTS + 1, // Before perception updates and Token render flags
      wait: context.preAnimate.length !== 0 ? Promise.all(context.preAnimate.map(fn => fn(context))) : undefined,
      ontick: (elapsedMS, animation) => {
        context.time = animation.time;
        if ( ontick ) ontick(elapsedMS, animation, this._PRIVATE_animationData);
        this._PRIVATE_animateFrame(context);
      }
    }).finally(() => {
      if ( this._PRIVATE_animationContexts.get(name) === context ) {
        this._PRIVATE_animationContexts.delete(name);
        for ( const fn of context.postAnimate ) fn(context);
        for ( const {resolve} of context.chain ) resolve();
      }
      resolve();
    });
    return context.promise;
  };

  /* -------------------------------------------- */

  /**
   * Get the duration of the animation.
   * @param {DeepReadonly<TokenAnimationData>} from           The animation data to animate from
   * @param {DeepReadonly<Partial<TokenAnimationData>>} to    The animation data to animate to
   * @param {TokenAnimationOptions} options                   The options that configure the animation behavior
   * @returns {number}                                        The duration of the animation in milliseconds
   * @protected
   */
  _getAnimationDuration(from, to, options) {
    let duration;
    if ( TokenDocument._isMovementUpdate(to, from) ) {
      const movementSpeed = this._modifyAnimationMovementSpeed(options.movementSpeed
        ?? this._getAnimationMovementSpeed(options), options);
      duration = NonPrivateToken._PRIVATE_getMovementAnimationDuration(from, to, movementSpeed);
    }
    const dr = from.rotation - (to.rotation ?? from.rotation);
    if ( dr ) {
      duration ??= 0;
      if ( this._requiresRotationAnimation() ) {
        const rotationSpeed = this._getAnimationRotationSpeed(options);
        duration = Math.max(duration, Math.abs(((Math.abs(dr) + 180) % 360) - 180) / (rotationSpeed * 60) * 1000);
      }
    }
    return duration ?? 1000; // The default animation duration is 1 second
  };

  /* -------------------------------------------- */

  /**
   * Calculate the movement animation duration.
   * @param {Omit<TokenPosition, "elevation"|"shape">} from           The from-position
   * @param {Partial<Omit<TokenPosition, "elevation"|"shape">>} to    The (partial) to-position
   * @param {number} movementSpeed                                    The movement speed
   * @returns {number}                                                The movement animation duration
   */
  static _PRIVATE_getMovementAnimationDuration(from, to, movementSpeed) {
    const dx = from.x - (to.x ?? from.x);
    const dy = from.y - (to.y ?? from.y);
    const dw = from.width - (to.width ?? from.width);
    const dh = from.height - (to.height ?? from.height);
    return Math.max(Math.hypot(dx, dy) / canvas.dimensions.size, Math.hypot(dw, dh) * 0.5) / movementSpeed * 1000;
  };

  /* -------------------------------------------- */

  /**
   * Configure the animation movement speed based on the given animation duration.
   * @param {DatabaseUpdateOperation} operation    The update operation
   * @param {TokenPosition} origin                 The origin
   * @param {TokenMovementWaypoint[]} waypoints    The candidante waypoints
   * @param {TokenDocument} document               The token document
   * @internal
   */
  static _configureAnimationMovementSpeed(operation, origin, waypoints, document) {
    if ( !document.rendered ) return;
    const animationDuration = operation.animation?.duration;
    if ( (animationDuration === undefined) || (operation.animation.movementSpeed !== undefined) ) return;
    if ( animationDuration === 0 ) operation.animation.movementSpeed = Number.MAX_VALUE;
    else {
      let normalizedDuration = 0;
      let previousWaypoint = origin;
      for ( const waypoint of waypoints ) {
        if ( CONFIG.Token.movement.actions[waypoint.action].getAnimationOptions(document.object).duration !== 0 ) {
          normalizedDuration += this._PRIVATE_getMovementAnimationDuration(previousWaypoint, waypoint, 1);
        }
        previousWaypoint = waypoint;
      }
      if ( normalizedDuration !== 0 ) {
        operation.animation.movementSpeed = Math.min(normalizedDuration / animationDuration, Number.MAX_VALUE);
      }
    }
  };

  /* -------------------------------------------- */

  /**
   * Handle a single frame of a token animation.
   * @param {TokenAnimationContext} context    The animation context
   */
  _PRIVATE_animateFrame(context) {
    const completed = context.time >= context.duration;
    if ( completed ) foundry.utils.mergeObject(this._PRIVATE_animationData, context.to);
    const animationData = foundry.utils.filterObject(this._PRIVATE_animationData, context.to);
    const changed = foundry.utils.diffObject(this._PRIVATE_priorAnimationData, animationData);
    foundry.utils.mergeObject(this._PRIVATE_priorAnimationData, changed);
    foundry.utils.mergeObject(this.document, this._PRIVATE_animationData, {insertKeys: false});
    for ( const fn of context.onAnimate ) fn(context);
    this._onAnimationUpdate(changed, context);
    if ( completed ) this._PRIVATE_completeAnimation(context);
  };

  /* -------------------------------------------- */

  /**
   * Complete the token animation.
   * @param {TokenAnimationContext} context    The animation context
   */
  _PRIVATE_completeAnimation(context) {
    if ( context.chain.length === 0 ) {
      this._PRIVATE_animationContexts.delete(context.name);
      for ( const fn of context.postAnimate ) fn(context);
    } else {
      const {to, options, resolve} = context.chain.shift();
      // noinspection ES6MissingAwait
      this._PRIVATE_animate(to, options, true).finally(resolve);
    }
  };

  /* -------------------------------------------- */

  /**
   * Terminate the animations of this particular Token, if exists.
   * @param {object} [options]                Additional options.
   * @param {boolean} [options.reset=true]    Reset the TokenDocument?
   */
  stopAnimation({reset=true}={}) {
    if ( reset ) this.document.reset();
    for ( const [name, context] of this._PRIVATE_animationContexts.entries() ) {
      CanvasAnimation.terminateAnimation(name);
      for ( const fn of context.postAnimate ) fn(context);
      for ( const {resolve} of context.chain ) resolve();
    }
    this._PRIVATE_animationContexts.clear();
    const to = this._getAnimationData();
    const changes = foundry.utils.diffObject(this._PRIVATE_animationData, to);
    foundry.utils.mergeObject(this._PRIVATE_animationData, to);
    foundry.utils.mergeObject(this._PRIVATE_priorAnimationData, this._PRIVATE_animationData);
    if ( foundry.utils.isEmpty(changes) ) return;
    const context = {name: Symbol(this.animationName), chain: [], to, duration: 0, time: 0,
      preAnimate: [], postAnimate: [], onAnimate: [], promise: Promise.resolve()};
    this._PRIVATE_animationContexts.set(context.name, context);
    this._onAnimationUpdate(changes, context);
    this._PRIVATE_animationContexts.clear();
  };

  /* -------------------------------------------- */
  /*  Animation Preparation Methods               */
  /* -------------------------------------------- */

  /**
   * Handle the rotation changes for the animation, ensuring the shortest rotation path.
   * @param {DeepReadonly<TokenAnimationData>} from    The animation data to animate from
   * @param {Partial<TokenAnimationData>} changes      The animation data changes
   */
  static _PRIVATE_handleRotationChanges(from, changes) {
    if ( "rotation" in changes ) {
      let dr = changes.rotation - from.rotation;
      while ( dr > 180 ) dr -= 360;
      while ( dr < -180 ) dr += 360;
      changes.rotation = from.rotation + dr;
    }
  };

  /* -------------------------------------------- */

  /**
   * Update the padding for both the source and target tokens to ensure they are square.
   * @param {PrimarySpriteMesh} sourceMesh  The source mesh
   * @param {PrimarySpriteMesh} targetMesh  The target mesh
   */
  static _PRIVATE_updatePadding(sourceMesh, targetMesh) {
    const calculatePadding = ({width, height}) => ({
      x: width > height ? 0 : (height - width) / 2,
      y: height > width ? 0 : (width - height) / 2
    });

    const paddingSource = calculatePadding(sourceMesh.texture);
    sourceMesh.paddingX = paddingSource.x;
    sourceMesh.paddingY = paddingSource.y;

    const paddingTarget = calculatePadding(targetMesh.texture);
    targetMesh.paddingX = paddingTarget.x;
    targetMesh.paddingY = paddingTarget.y;
  };

  /* -------------------------------------------- */

  /**
   * Create a texture transition filter with the given options.
   * @param {TokenAnimationOptions} options    The options that configure the animation behavior
   * @returns {TextureTransitionFilter}        The created filter
   */
  _PRIVATE_createTransitionFilter(options) {
    const filter = TextureTransitionFilter.create();
    filter.enabled = false;
    filter.type = options.transition ?? this._getAnimationTransition(options);
    return filter;
  };

  /* -------------------------------------------- */

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
    const attributes = [];

    // TODO: handle teleportation
    NonPrivateToken._PRIVATE_handleRotationChanges(from, changes);
    this._PRIVATE_handleTransitionChanges(changes, context, options, attributes);

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
  };

  /* -------------------------------------------- */

  /**
   * Handle the transition changes, creating the necessary filter and preparing the textures.
   * @param {Partial<TokenAnimationData>} changes               The animation data that changed
   * @param {Omit<TokenAnimationContext, "promise">} context    The animation context
   * @param {TokenAnimationOptions} options                     The options that configure the animation behavior
   * @param {CanvasAnimationAttribute[]} attributes             The array to push animation attributes to
   */
  _PRIVATE_handleTransitionChanges(changes, context, options, attributes) {
    const textureChanged = ("texture" in changes) && ("src" in changes.texture);
    const ringEnabled = this.document.ring.enabled;
    const subjectTextureChanged = ringEnabled && ("ring" in changes) && ("subject" in changes.ring) && ("texture" in changes.ring.subject);

    // If no texture has changed, no need for a transition
    if ( !(textureChanged || subjectTextureChanged) ) return;

    const filter = this._PRIVATE_createTransitionFilter(options);
    let renderTexture;
    let targetMesh;
    let targetToken;

    if ( this.mesh ) {
      this.mesh.filters ??= [];
      this.mesh.filters.unshift(filter);
    }

    context.preAnimate.push(async context => {
      const targetAsset = !ringEnabled ? changes.texture.src
        : (subjectTextureChanged ? changes.ring.subject.texture : this.document.ring.subject.texture);
      const targetTexture = await loadTexture(targetAsset, {fallback: CONST.DEFAULT_TOKEN});
      targetToken = this._PRIVATE_prepareTargetToken(targetTexture);

      // Create target primary sprite mesh and assign to the target token
      targetMesh = new PrimarySpriteMesh({object: targetToken});
      targetMesh.texture = targetTexture;
      targetToken.mesh = targetMesh;

      // Prepare source and target meshes and shader class
      if ( ringEnabled ) {
        targetToken._PRIVATE_ring = new CONFIG.Token.ring.ringClass(targetToken);
        targetToken._PRIVATE_ring.configure(targetMesh);
        targetMesh.setShaderClass(CONFIG.Token.ring.shaderClass);
      }
      else {
        NonPrivateToken._PRIVATE_updatePadding(this.mesh, targetMesh);
        targetMesh.setShaderClass(PrimaryBaseSamplerShader);
      }

      // Prepare mesh position for rendering
      targetMesh.position.set(targetMesh.paddingX, targetMesh.paddingY);

      // Configure render texture and render the target mesh into it
      const renderer = canvas.app.renderer;
      renderTexture = renderer.generateTexture(targetMesh, {resolution: targetMesh.texture.resolution});

      // Add animation function if ring effects are enabled
      if ( targetToken.hasDynamicRing && (this.document.ring.effects > CONFIG.Token.ring.ringClass.effects.ENABLED) ) {
        context.onAnimate.push(function() {
          canvas.app.renderer.render(targetMesh, {renderTexture});
        });
      }

      // Preparing the transition filter
      filter.targetTexture = renderTexture;
      filter.enabled = true;
    });

    context.postAnimate.push(async context => {
      await Promise.resolve();
      // Clean up after the current tick because the redraw triggered by _onAnimationUpdate
      // won't take effect in the last frame of the animation
      targetMesh?.destroy();
      renderTexture?.destroy(true);
      targetToken?.destroy({children: true});
      this.mesh?.filters?.findSplice(f => f === filter);
      if ( !this.hasDynamicRing && this.mesh ) this.mesh.padding = 0;
    });

    attributes.push({attribute: "progress", parent: filter.uniforms, to: 1});
  };

  /* -------------------------------------------- */

  /**
   * Prepare a target token by cloning the current token and setting its texture.
   * @param {PIXI.Texture} targetTexture  The texture to set on the target token
   * @returns {Token}  The prepared target token
   */
  _PRIVATE_prepareTargetToken(targetTexture) {
    const cloneDoc = this.document.clone();
    const clone = cloneDoc.object;
    clone.texture = targetTexture;
    return clone;
  };

  /* -------------------------------------------- */

  /**
   * Check for collision when attempting a move to a new position.
   *
   * The result of this function must not be affected by the animation of this Token.
   * @param {Point|ElevatedPoint} destination         The central destination point of the attempted movement.
   *                                                  The elevation defaults to the elevation of the origin.
   * @param {object} [options={}]                     Additional options forwarded to PointSourcePolygon.testCollision
   * @param {Point|ElevatedPoint} [options.origin]    The origin to be used instead of the current origin. The elevation
   *                                                  defaults to the current elevation.
   * @param {PointSourcePolygonType} [options.type="move"]    The collision type
   * @param {"any"|"all"|"closest"} [options.mode="any"]      The collision mode to test: "any", "all", or "closest"
   * @returns {boolean|PolygonVertex|PolygonVertex[]|null}    The collision result depends on the mode of the test:
   *                                                * any: returns a boolean for whether any collision occurred
   *                                                * all: returns a sorted array of PolygonVertex instances
   *                                                * closest: returns a PolygonVertex instance or null
   */
  checkCollision(destination, {origin, type="move", mode="any"}={}) {

    // Round origin and destination such that the top-left point (i.e. the Token's position) is integer
    const {elevation, width, height, shape} = this.document._source;
    const {x: cx, y: cy} = this.document.getCenterPoint({x: 0, y: 0, elevation, width, height, shape});
    if ( !origin ) origin = this.document.getCenterPoint(this.document._source);
    else {
      origin = {
        x: Math.round(origin.x - cx) + cx,
        y: Math.round(origin.y - cy) + cy,
        elevation: origin.elevation ?? elevation
      };
    }
    destination = {
      x: Math.round(destination.x - cx) + cx,
      y: Math.round(destination.y - cy) + cy,
      elevation: destination.elevation ?? origin.elevation
    };

    // The test destination is the adjusted point based on the proposed movement vector
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    const offsetX = dx === 0 ? this._PRIVATE_centerOffset.x : Math.sign(dx);
    const offsetY = dy === 0 ? this._PRIVATE_centerOffset.y : Math.sign(dy);
    destination = this.getMovementAdjustedPoint(destination, {offsetX, offsetY});
    origin = this.getMovementAdjustedPoint(origin);

    // Reference the correct source object
    let source;
    switch ( type ) {
      case "move":
        source = this._PRIVATE_getMovementSource(origin); break;
      case "sight":
        source = this.vision; break;
      case "light":
        source = this.light; break;
      case "sound":
        throw new Error("Collision testing for Token sound sources is not supported at this time");
    }

    // Create a movement source passed to the polygon backend
    return CONFIG.Canvas.polygonBackends[type].testCollision(origin, destination, {type, mode, source});
  };

  /* -------------------------------------------- */

  /**
   * Prepare a PointMovementSource for the document
   * @param {ElevatedPoint} origin        The origin of the source
   * @returns {PointMovementSource}
   */
  _PRIVATE_getMovementSource(origin) {
    const movement = new PointMovementSource({object: this});
    movement.initialize(origin);
    return movement;
  };

  /* -------------------------------------------- */

  /**
   * Constrain the given movement path.
   *
   * The result of this function must not be affected by the animation of this Token.
   * @param {TokenConstrainMovementPathWaypoint[]} waypoints    The waypoints of movement
   * @param {TokenConstrainMovementPathOptions} [options]       Additional options
   * @returns {[constrainedPath: TokenConstrainedMovementWaypoint[], wasConstrained: boolean]}
   *   The (constrained) path of movement and a boolean that is true if and only if the path was constrained.
   *   If it wasn't constrained, then a copy of the path of all given waypoints with all default values filled in
   *   is returned.
   */
  constrainMovementPath(waypoints, {preview=false, ignoreWalls=false, ignoreCost=false, history=false}={}) {

    // Ignore preview if token vision is disabled or the current user is a GM
    if ( !canvas.visibility.tokenVision || game.user.isGM ) preview = false;

    // Compute the path up until the next waypoint that is blocked by a wall
    const result = {path: [], constrained: false};
    const source = this.document._source;
    let {x=source.x, y=source.y, elevation=source.elevation, width=source.width, height=source.height,
      shape=source.shape, action=this.document.movementAction, terrain=null, snapped=false, explicit=false,
      checkpoint=false, intermediate=false} = waypoints[0];
    x = Math.round(x);
    y = Math.round(y);
    if ( terrain ) terrain = terrain.clone();
    let waypoint = {x, y, elevation, width, height, shape, action, terrain, snapped, explicit, checkpoint,
      intermediate};
    result.path.push(waypoint);

    // Compute adjusted origin
    let origin;
    let offsetX;
    let offsetY;
    let center;
    if ( !ignoreWalls ) {
      offsetX = this._PRIVATE_centerOffset.x;
      offsetY = this._PRIVATE_centerOffset.y;
      center = this.document.getCenterPoint(waypoint);
      origin = this.getMovementAdjustedPoint(center, {offsetX, offsetY});
    }

    for ( let i = 1; i < waypoints.length; i++ ) {
      const priorWaypoint = waypoint;
      let {x=waypoint.x, y=waypoint.y, elevation=waypoint.elevation, width=waypoint.width, height=waypoint.height,
        shape=waypoint.shape, action=waypoint.action, terrain=null, snapped=false, explicit=false,
        checkpoint=false, intermediate=false} = waypoints[i];
      x = Math.round(x);
      y = Math.round(y);
      if ( terrain ) terrain = terrain.clone();
      waypoint = {x, y, elevation, width, height, shape, action, terrain, snapped, explicit, checkpoint, intermediate};

      // Test scene bounds
      const priorCenter = center;
      center = this.document.getCenterPoint(waypoint);
      if ( !canvas.dimensions.rect.contains(center.x, center.y) ) {
        result.constrained = true;
        break;
      }

      // Compute adjusted destination
      let destination;
      const priorOffsetX = offsetX;
      const priorOffsetY = offsetY;
      if ( !ignoreWalls ) {
        const ox = Math.sign(center.x - priorCenter.x);
        const oy = Math.sign(center.y - priorCenter.y);
        if ( ox !== 0 ) offsetX = ox;
        if ( oy !== 0 ) offsetY = oy;
        destination = this.getMovementAdjustedPoint(center, {offsetX, offsetY});
      }

      // Check for collisions with walls unless teleporting
      const wallType = CONFIG.Token.movement.actions[action].walls;
      if ( !ignoreWalls && wallType ) {
        let collision = this._PRIVATE_testWallCollision(origin, destination, wallType, preview);
        if ( collision ) {
          result.constrained = true;

          // Calculate the 3D collision point
          collision = {
            x: Math.round(collision.x - (center.x - waypoint.x)),
            y: Math.round(collision.y - (center.y - waypoint.y)),
            elevation: Math.mix(origin.elevation, destination.elevation, collision._distance)
          };

          // Restore prior center and x/y-offset
          center = priorCenter;
          offsetX = priorOffsetX;
          offsetY = priorOffsetY;

          // Get the collision waypoint
          const collisionWaypoint = this._PRIVATE_getCollisionWaypoint(waypoint, collision, origin, center, offsetX, offsetY,
            wallType, preview);
          if ( !collisionWaypoint ) {

            // The last waypoint must not be intermediate
            if ( priorWaypoint.intermediate ) {
              priorWaypoint.intermediate = false;
              priorWaypoint.explicit = false;
            }
            break;
          }

          // Skip if collision waypoint is almost the same as the origin waypoint
          if ( Math.max(Math.abs(collisionWaypoint.x - priorWaypoint.x),
            Math.abs(collisionWaypoint.y - priorWaypoint.y)) <= 1 ) break;

          // Add collision waypoint to the result
          result.path.push(collisionWaypoint);
          break;
        }
      }

      result.path.push(waypoint);
      origin = destination;
    }

    // Allow only movement with finite cost
    if ( !ignoreCost ) this._PRIVATE_constrainMovementPathCost(result, {preview, history});

    return [result.path, result.constrained];
  };

  /* -------------------------------------------- */

  /**
   * Get the collision waypoint for the given segment where a collision occurred.
   * @param {TokenMovementWaypoint} waypoint  The destination waypoint
   * @param {ElevatedPoint} collision         The point of collision with the wall
   * @param {ElevatedPoint} origin            The adjusted center point of the origin waypoint
   * @param {ElevatedPoint} center            The unadjusted center point of the origin waypoint
   * @param {number} offsetX                  The current x-offset
   * @param {number} offsetY                  The current y-offset
   * @param {string} type                     The wall type
   * @param {boolean} preview                 Is this a preview?
   * @returns {TokenConstrainedMovementWaypoint|void}    The collision waypoint, or undefined if the movement
   *                                                     should stop at the origin
   */
  _PRIVATE_getCollisionWaypoint(waypoint, collision, origin, center, offsetX, offsetY, type, preview) {
    const priorOffsetX = offsetX;
    const priorOffsetY = offsetY;

    // If not snapped or gridless, we use the exact point of collision if possible
    if ( !waypoint.snapped || canvas.grid.isGridless ) {
      const k = Math.ceil(canvas.dimensions.size / 4);
      const n = Math.ceil(Math.hypot(collision.x - origin.x, collision.y - origin.y));
      for ( let j = 0; j < n; j += Math.clamp(j, 1, k) ) {
        const t = j / n;
        const p = {
          x: Math.round(Math.mix(collision.x, origin.x, t)),
          y: Math.round(Math.mix(collision.y, origin.y, t)),
          elevation: Math.mix(collision.elevation, origin.elevation, t),
          width: waypoint.width, height: waypoint.height, shape: waypoint.shape,
          action: waypoint.action, terrain: waypoint.terrain, snapped: false, explicit: false, checkpoint: false,
          intermediate: false
        };
        const c = this.document.getCenterPoint(p);
        const ox = Math.sign(c.x - center.x);
        const oy = Math.sign(c.y - center.y);
        if ( ox !== 0 ) offsetX = ox;
        if ( oy !== 0 ) offsetY = oy;
        const destination = this.getMovementAdjustedPoint(c, {offsetX, offsetY});
        if ( !this._PRIVATE_testWallCollision(origin, destination, type, preview) ) return p;
        offsetX = priorOffsetX;
        offsetY = priorOffsetY;
      }
    }

    // Otherwise we try to find the closest snapped position between the origin and the collision.
    // Note that this algorithm might not return the closest (best) snapped position.
    else {
      const d = canvas.dimensions;
      const n = Math.ceil(Math.hypot(collision.x - origin.x, collision.y - origin.y,
        (collision.elevation - origin.elevation) * d.distancePixels) / (d.size / 4));
      for ( let j = 0; j < n; j++ ) {
        const t = j / n;
        const p = this.document.getSnappedPosition({
          x: Math.mix(collision.x, origin.x, t),
          y: Math.mix(collision.y, origin.y, t),
          elevation: Math.mix(collision.elevation, origin.elevation, t),
          width: waypoint.width, height: waypoint.height, shape: waypoint.shape
        });
        p.x = Math.round(p.x);
        p.y = Math.round(p.y);
        p.width = waypoint.width;
        p.height = waypoint.height;
        p.shape = waypoint.shape;
        const c = this.document.getCenterPoint(p);
        const ox = Math.sign(c.x - center.x);
        const oy = Math.sign(c.y - center.y);
        if ( ox !== 0 ) offsetX = ox;
        if ( oy !== 0 ) offsetY = oy;
        const destination = this.getMovementAdjustedPoint(c, {offsetX, offsetY});
        if ( !this._PRIVATE_testWallCollision(origin, destination, type, preview) ) {
          p.action = waypoint.action;
          p.terrain = waypoint.terrain;
          p.snapped = true;
          p.explicit = false;
          p.checkpoint = false;
          p.intermediate = false;
          return p;
        }
        offsetX = priorOffsetX;
        offsetY = priorOffsetY;
      }
    }
  };

  /* -------------------------------------------- */

  /**
   * Test for wall collision for a movement between two points.
   * @param {ElevatedPoint} origin         The adjusted origin
   * @param {ElevatedPoint} destination    The adjusted destination
   * @param {string} type                  The wall type
   * @param {boolean} preview              Is preview?
   * @returns {PolygonVertex|null}         The collision point with a wall, if any
   */
  _PRIVATE_testWallCollision(origin, destination, type, preview) {
    let collision = null;
    const source = this._PRIVATE_getMovementSource(origin);
    const polygonBackend = CONFIG.Canvas.polygonBackends[type];
    if ( preview ) {
      // TODO: open doors that are not visible should be considered closed
      const collisions = polygonBackend.testCollision(origin, destination, {type, mode: "all", source});

      // Only visible or explored collisions block preview movement
      for ( const c of collisions ) {
        if ( canvas.fog.isPointExplored(c) || canvas.visibility.testVisibility(c, {tolerance: 1})) {
          collision = c;
          break;
        }
      }
    }
    else collision = polygonBackend.testCollision(origin, destination, {type, mode: "closest", source});
    return collision;
  };

  /* -------------------------------------------- */

  /**
   * Discard the first waypoint that requires an infinite cost to move to and all waypoints after this one.
   * @param {{path: TokenMovementWaypoint[], constrained: boolean}} result            The result
   * @param {Pick<TokenConstrainMovementPathOptions, "preview"|"history">} options    The options
   */
  _PRIVATE_constrainMovementPathCost(result, {preview, history}) {
    if ( result.path.length === 0 ) return;
    if ( !Array.isArray(history) ) history = history ? this.document.movementHistory : [];

    // Bridge the gap between the last recorded position and the first of the given waypoints
    // so that the gap is measured with 0 cost
    const previous = history.at(-1);
    if ( previous ) {
      const origin = result.path[0];
      if ( !TokenDocument.arePositionsEqual(previous, origin) ) {
        const {x, y, elevation, width, height, shape} = origin;
        history = [...history, {x, y, elevation, width, height, shape, action: "displace", cost: 0}];
      }
    }

    // Discard the first waypoint that requires an infinite cost to move to and all waypoints after this one
    const measurement = this.measureMovementPath(history.concat(result.path), {preview});
    if ( measurement.cost !== Infinity ) return;
    let n = history.length;
    while ( (n < measurement.waypoints.length) && (measurement.waypoints[n].backward?.cost !== Infinity) ) n++;
    n -= history.length;
    if ( result.path.length === n ) return;
    if ( n > 0 ) {

      // The last waypoint must not be intermediate
      const last = result.path[n - 1];
      if ( last.intermediate ) {
        last.intermediate = false;
        last.explicit = false;
      }
    }
    result.path.length = n;
    result.constrained = true;
  };

  /* -------------------------------------------- */

  /**
   * Create the animation path.
   * @param {TokenPosition} origin                               The origin of movement
   * @param {TokenMeasuredMovementWaypoint[]} passedWaypoints    The passed waypoints
   * @returns {[waypoints: (Omit<TokenMovementWaypoint, "snapped"|"explicit"|"checkpoint">
   *    & {regions: Set<RegionDocument>; ray: Ray|null})[], initialRegions: Set<RegionDocument>])}
   *                                                             The regionalized animation path
   */
  _PRIVATE_createAnimationMovementPath(origin, passedWaypoints) {
    const path = [];
    const initialRegions = new Set();
    if ( passedWaypoints.length === 0 ) return [path, initialRegions];

    let from = origin;
    let previousCenter = this.document.getCenterPoint(from);
    let rayIndex = 0;

    // Create region states
    const regionStates = [];
    for ( const region of this.scene.regions ) {
      if ( region.behaviors.some(b => !b.disabled && (b.hasEvent(CONST.REGION_EVENTS.TOKEN_ANIMATE_IN)
        || b.hasEvent(CONST.REGION_EVENTS.TOKEN_ANIMATE_OUT))) ) {
        const active = this.document.testInsideRegion(region, from);
        if ( active ) initialRegions.add(region);
        regionStates.push({region, active});
      }
    }

    const distancePixels = this.scene.dimensions.distancePixels;
    for ( let i = 0; i < passedWaypoints.length; i++ ) {
      const to = passedWaypoints[i];
      if ( to.intermediate && !to.explicit ) continue;

      // Find region waypoints
      const regionWaypoints = [];
      for ( const state of regionStates ) {
        const segments = this.document.segmentizeRegionMovementPath(state.region, [from, to]);
        for ( const {type, from} of segments ) {
          const center = this.document.getCenterPoint(from);
          const dx = center.x - previousCenter.x;
          const dy = center.y - previousCenter.y;
          const dz = (center.elevation - previousCenter.elevation) * distancePixels;
          const t = (dx * dx) + (dy * dy) + (dz * dz);
          regionWaypoints.push({t, x: from.x, y: from.y, elevation: from.elevation,
            width: from.width, height: from.height, shape: from.shape,
            crosses: type !== REGION_MOVEMENT_SEGMENTS.MOVE, state, regions: null});
        }
      }

      // Sort region waypoints
      regionWaypoints.sort((w0, w1) => w0.t - w1.t);

      // Process region waypoints
      let n = regionWaypoints.length;
      if ( n !== 0 ) {
        let k = 0;
        let d = 0;
        for (let j = 0; j + 1 < n; j++) {
          const w0 = regionWaypoints[j];
          const w1 = regionWaypoints[j + 1];

          // Same position: combine them
          if ( TokenDocument.arePositionsEqual(w0, w1) ) {
            k++;
            d++;
            continue;
          }

          // Different position: set regions of the previous region waypoint
          w0.regions = new Set();
          for ( const state of regionStates ) {
            if ( state.active ) w0.regions.add(state.region);
          }

          // Update active states: moving to w1
          if ( w0.crosses ) w0.state.active = !w0.state.active;
          while ( d !== 0 ) {
            const w = regionWaypoints[j - d--];
            if ( w.crosses ) w.state.active = !w.state.active;
          }

          if ( k !== 0 ) regionWaypoints[j - k] = w0;
        }

        // Process the last region waypoint
        const w1 = regionWaypoints[n - 1];
        w1.regions = new Set();
        for ( const state of regionStates ) {
          if ( state.active ) w1.regions.add(state.region);
        }

        // Update active states: moving past the last waypoint
        if ( w1.crosses ) w1.state.active = !w1.state.active;
        while ( d !== 0 ) {
          const w = regionWaypoints[n - 1 - d--];
          if ( w.crosses ) w.state.active = !w.state.active;
        }

        if ( k !== 0 ) {
          regionWaypoints[n - 1 - k] = w1;
          n -= k;
        }
      }

      let regions;

      let j = 0;
      if ( n !== 0 ) {

        // Skip the first region waypoint if it matches the previous movement waypoint
        const first = regionWaypoints[0];
        if ( TokenDocument.arePositionsEqual(first, from) ) j = 1;

        // Skip the last region waypoint if it matches the current movement waypoint
        const last = regionWaypoints[n - 1];
        if ( TokenDocument.arePositionsEqual(last, to) ) {
          n -= 1;
          regions = last.regions;
        }
      }

      let previousRegions;

      // Add the region waypoints between the previous and the current movement waypoint
      while ( j < n ) {
        const {x, y, elevation, width, height, shape, regions} = regionWaypoints[j++];

        // Remove redundant region waypoints
        if ( previousRegions?.equals(regions) ) path.pop();

        path.push({x, y, elevation, width, height, shape, action: to.action, terrain: to.terrain, regions, ray: null});
        previousRegions = regions;
      }

      if ( regions === undefined ) {
        regions = new Set();
        for ( const state of regionStates ) {
          if ( state.active ) regions.add(state.region);
        }
      }

      // Remove redundant region waypoint
      if ( previousRegions?.equals(regions) ) path.pop();

      // Add the current movement waypoint
      path.push({x: to.x, y: to.y, elevation: to.elevation, width: to.width, height: to.height, shape: to.shape,
        action: to.action, terrain: to.terrain, regions, ray: null});

      if ( !to.intermediate ) {
        const center = this.document.getCenterPoint(to);
        path[rayIndex].ray = new Ray(previousCenter, center);
        previousCenter = center;
        rayIndex = path.length;
      }

      from = to;
    }

    return [path, initialRegions];
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onUpdate(changed, options, userId) {
    PlaceableObject.prototype._onUpdate.call(this, changed, options, userId);
    const doc = this.document;

    // Update the center offset
    this._PRIVATE_onUpdateCenterOffset(options);

    // Update drag preview
    this._PRIVATE_onUpdateDrag(changed, options, userId);

    // Acquire or release Token control
    const hiddenChanged = "hidden" in changed;
    if ( hiddenChanged ) {
      if ( !game.user.isGM ) {
        // Release your controlled token if it becomes hidden
        if ( this.controlled && changed.hidden ) this.release();
        // Gain control over your token if it becomes visible and you don't already control something
        else if ( this.isOwner && (changed.hidden === false) && !canvas.tokens.controlled.length ) {
          this.control({pan: true});
        }
      }
      if ( this.isOwner && (this.layer.occlusionMode & CONST.TOKEN_OCCLUSION_MODES.OWNED) ) {
        canvas.perception.update({refreshOcclusion: true});
      }
    }

    // Automatically pan the canvas
    const positionChanged = ("x" in changed) || ("y" in changed);
    if ( positionChanged && this.controlled && (options.pan !== false) ) this._PRIVATE_panCanvas();

    // Handle animation
    this._PRIVATE_onUpdateAnimation(changed, options, userId);

    // Process Combat Tracker changes
    if ( this.inCombat && ("name" in changed) ) game.combat.debounceSetup();

    // Source and perception updates
    if ( hiddenChanged || ("light" in changed) || ("sight" in changed) || ("detectionModes" in changed) ) {
      this.initializeSources();
    }
    if ( !game.user.isGM && this.controlled && (hiddenChanged || (("sight" in changed) && ("enabled" in changed.sight))) ) {
      for ( const token of this.layer.placeables ) {
        if ( (token !== this) && (!token.vision === token._isVisionSource()) ) token.initializeVisionSource();
      }
    }
    if ( hiddenChanged ) canvas.perception.update({refreshVision: true, refreshSounds: true, refreshOcclusion: true});
    if ( "occludable" in changed ) canvas.perception.update({refreshOcclusionMask: true});

    // Incremental refresh
    const textureChanged = "texture" in changed;
    const ringEnabled = doc.ring.enabled;
    const ringChanged = "ring" in changed;
    const ringEnabledChanged = ringChanged && ("enabled" in changed.ring);
    const ringVisualsChanged = ringEnabled && ringChanged && (("colors" in changed.ring) || ("effects" in changed.ring));
    this.renderFlags.set({
      redraw: ringEnabledChanged || ("actorId" in changed) || ("actorLink" in changed),
      refreshState: hiddenChanged || ("sort" in changed) || ("disposition" in changed) || ("displayBars" in changed) || ("displayName" in changed),
      refreshRotation: "lockRotation" in changed,
      refreshMesh: textureChanged && ("fit" in changed.texture),
      refreshShape: "shape" in changed,
      refreshBars: ["displayBars", "bar1", "bar2"].some(k => k in changed),
      refreshNameplate: ["displayName", "name"].some(k => k in changed),
      refreshRingVisuals: ringVisualsChanged,
      refreshTurnMarker: ("turnMarker" in changed) || ("disposition" in changed),
      refreshRuler: "_movementHistory" in changed
    });
  };

  /* -------------------------------------------- */

  /**
   * Update the center offset.
   * @param {TokenPosition} origin                                 The origin
   * @param {TokenPosition & {intermediate?: boolean}} waypoints   The waypoints
   */
  _PRIVATE_updateCenterOffset(origin, waypoints) {
    if ( waypoints.length === 0 ) return;
    let c0 = this.document.getCenterPoint(origin);
    for ( const waypoint of waypoints ) {
      if ( waypoint.intermediate ) continue;
      const c1 = this.document.getCenterPoint(waypoint);
      if ( c1.x !== c0.x ) this._PRIVATE_centerOffset.x = Math.sign(c1.x - c0.x);
      if ( c1.y !== c0.y ) this._PRIVATE_centerOffset.y = Math.sign(c1.y - c0.y);
      c0 = c1;
    }
  };

  /* -------------------------------------------- */

  /**
   * Update the center offset unless animating.
   * Called in {@link Token_PRIVATE__onUpdate}.
   * @param {object} options    The update options
   */
  _PRIVATE_onUpdateCenterOffset(options) {
    const movement = options._movement?.[this.document.id];
    if ( movement ) this._PRIVATE_updateCenterOffset(movement.origin, movement.passed.waypoints);

    // If animating, we update the animated center offset for each movement waypoint in Token_PRIVATE__PRIVATE_onUpdateAnimation
    if ( options.animate !== false ) return;
    this._PRIVATE_animationCenterOffset.x = this._PRIVATE_centerOffset.x;
    this._PRIVATE_animationCenterOffset.y = this._PRIVATE_centerOffset.y;
  };

  /* -------------------------------------------- */

  /**
   * Update drag preview and the ruler path.
   * Called in {@link Token_PRIVATE__onUpdate}.
   * @param {object} changed    The changes
   * @param {object} options    The update options
   * @param {string} userId     The ID of the User that initiated the update operation
   */
  _PRIVATE_onUpdateDrag(changed, options, userId) {
    const context = this._PRIVATE_getDragContext();
    if ( !context ) return;
    if ( foundry.utils.isEmpty(changed) ) return;

    // Update the preview token, but keep current position
    context.clonedToken.document.updateSource(changed);
    context.clonedToken.document.x = context.destination.x;
    context.clonedToken.document.y = context.destination.y;
    context.clonedToken.document.elevation = context.destination.elevation;
    context.clonedToken.document.width = context.destination.width ?? this.document._source.width;
    context.clonedToken.document.height = context.destination.height ?? this.document._source.height;
    context.clonedToken.document.shape = context.destination.shape ?? this.document._source.shape;
    context.clonedToken.renderFlags.set({refresh: true});

    // The ruler only needs updating if the position, size, or shape changed, or the movement history changed
    const hasMoved = TokenDocument._isMovementUpdate(changed);
    if ( !hasMoved && !("_movementHistory" in changed) ) return;
    if ( hasMoved ) {

      // Prevent panning
      options.pan = false;

      // Update the origin
      const oldOrigin = context.origin;
      const newOrigin = context.origin = {
        x: this.document._source.x,
        y: this.document._source.y,
        elevation: this.document._source.elevation,
        width: this.document._source.width,
        height: this.document._source.height,
        shape: this.document._source.shape
      };

      // Update the waypoints and destination
      const updateWaypoint = (waypoint, ignoreElevation=true) => {

        // Update (x, y, elevation) such that center point before and after is the same
        const center = this.document.getCenterPoint({x: waypoint.x, y: waypoint.y,
          elevation: waypoint.elevation, width: waypoint.width ?? oldOrigin.width,
          height: waypoint.height ?? oldOrigin.height, shape: waypoint.shape ?? oldOrigin.shape});
        const pivot = this.document.getCenterPoint({x: 0, y: 0, elevation: 0, width: newOrigin.width,
          height: newOrigin.height, shape: newOrigin.shape});
        waypoint.x = Math.round(center.x - pivot.x);
        waypoint.y = Math.round(center.y - pivot.y);
        waypoint.elevation = center.elevation - pivot.elevation;

        // Check that after resizing the waypoint is still in a snapped position
        if ( waypoint.snapped ) {
          const {x, y, elevation} = waypoint;
          const {width=newOrigin.width, height=newOrigin.height, shape=newOrigin.shape} = waypoint;
          const snapped = this.document.getSnappedPosition({x, y, elevation, width, height, shape});
          if ( !((x === Math.round(snapped.x)) && (y === Math.round(snapped.y))
            && (ignoreElevation || elevation.almostEqual(snapped.elevation))) ) {
            waypoint.snapped = false;
          }
        }
      };
      context.waypoints.forEach(updateWaypoint);
      updateWaypoint(context.destination, false);

      // Update destination of the preview
      NonPrivateToken._PRIVATE_updateDragPreview(context.clonedToken, context.destination);
    }

    // Update the ruler path
    this.recalculatePlannedMovementPath();
  };

  /* -------------------------------------------- */

  /**
   * Animate the changes to this Token.
   * Called in {@link Token_PRIVATE__onUpdate}.
   * @param {object} changed    The changes
   * @param {object} options    The update options
   * @param {string} userId     The ID of the User that initiated the update operation
   */
  _PRIVATE_onUpdateAnimation(changed, options, userId) {
    if ( options.animate === false ) {
      this.stopAnimation({reset: false});
      this._PRIVATE_showRuler = false;
      this._preventKeyboardMovement = false;
      return;
    }
    const movement = options._movement?.[this.document.id];
    const animationData = this._getAnimationData();
    const to = foundry.utils.filterObject(animationData, changed);

    // Delete positional and size from the animation data, which we are animating separately
    for ( const k of TokenDocument.MOVEMENT_FIELDS ) delete to[k];
    if ( movement && movement.autoRotate ) delete to.rotation;

    // TODO: Can we find a solution that doesn't require special handling for hidden?
    if ( "hidden" in changed ) to.alpha = animationData.alpha;

    // We need to infer subject texture if ring is enabled and texture is changed
    const ringEnabled = this.document.ring.enabled;
    const ringChanged = "ring" in changed;
    const ringEnabledChanged = ringChanged && ("enabled" in changed.ring);
    const ringSubjectChanged = ringEnabled && ringChanged && ("subject" in changed.ring);
    const ringSubjectTextureChanged = ringSubjectChanged && ("texture" in changed.ring.subject);
    if ( (ringEnabled || ringEnabledChanged) && !ringSubjectTextureChanged && ("texture" in changed)
      && ("src" in changed.texture) && !this.document._source.ring.subject.texture ) {
      foundry.utils.mergeObject(to, {ring: {subject: {texture: animationData.ring.subject.texture}}});
    }

    // Animate movement separately from the non-movement-related fields
    let movementAnimationDuration;
    if ( movement ) {
      const previousMovementAnimationPromise = this.movementAnimationPromise;
      let movementAnimationPromise = previousMovementAnimationPromise;
      this._PRIVATE_showRuler = movement.showRuler;

      // Prevent keyboard movement until right before the movement animation ends
      this._preventKeyboardMovement = true;

      const rotationSpeed = 24;  // 250 ms per 360 degrees
      const runningAnimations = [];
      const [animationPath, initialRegions] = this._PRIVATE_createAnimationMovementPath(movement.origin,
        movement.passed.waypoints);
      for ( const waypoint of animationPath ) {

        // If there's a ray, it's the first waypoint on a segment
        const ray = waypoint.ray;
        if ( waypoint.ray ) {
          if ( movement.autoRotate ) {
            if ( ray.distance > 0 ) {
              const rotation = Math.toDegrees(ray.angle) + (movement.method === "undo" ? 90 : -90);
              movementAnimationPromise = this.animate({rotation}, {
                ...(options.animation ?? {}),
          name: this.movementAnimationName,
                chain: true,
                action: waypoint.action,
                movementSpeed: rotationSpeed
              });
            }

            // Update center offset
            const updateCenterOffset = () => {
              if ( ray.dx !== 0 ) this._PRIVATE_animationCenterOffset.x = Math.sign(ray.dx);
              if ( ray.dy !== 0 ) this._PRIVATE_animationCenterOffset.y = Math.sign(ray.dy);
            };
            if ( movementAnimationPromise ) movementAnimationPromise.finally(updateCenterOffset);
            else updateCenterOffset();
          }
        }

        // Dispatch animation for the waypoint
        const start = movementAnimationPromise;
        const end = this.animate({
          x: waypoint.x,
          y: waypoint.y,
          elevation: waypoint.elevation,
          width: waypoint.width,
          height: waypoint.height,
          shape: waypoint.shape
        }, {
          ...(options.animation ?? {}),
          name: this.movementAnimationName,
          chain: true,
          action: waypoint.action,
          terrain: waypoint.terrain,
          movementSpeed: options.animation?.movementSpeed
        });
        const context = this._PRIVATE_animationContexts.get(this.movementAnimationName);
        const duration = context ? context.chain.at(-1)?.options.duration ?? context.duration : 0;
        runningAnimations.push({start, end, duration});

        movementAnimationPromise = end;
      }
      if ( movement.autoRotate ) {
        movementAnimationPromise = this.animate({rotation: animationData.rotation}, {
          ...(options.animation ?? {}),
          name: this.movementAnimationName,
          chain: true,
          action: animationPath.at(-1).action,
          movementSpeed: rotationSpeed
        });
      }

      // Handle region animation events
      this._PRIVATE_handleAnimateInOutRegionEvents(movement.origin, animationPath, initialRegions, runningAnimations);

      // Hide ruler at the end of the movement animation
      if ( movement.showRuler ) {
        if ( movementAnimationPromise ) {
          const movementId = movement.id;
          movementAnimationPromise.finally(() => {
            if ( this.document.movement.id !== movementId ) return;
            if ( ["completed", "stopped"].includes(this.document.movement.state) ) this._PRIVATE_showRuler = false;
          });
        }
        else if ( ["completed", "stopped"].includes(this.document.movement.state) ) this._PRIVATE_showRuler = false;
      }

      // Refresh ruler
      this.renderFlags.set({refreshRuler: true, refreshState: true});
      movementAnimationPromise?.finally(() => this.renderFlags.set({refreshRuler: true, refreshState: true}));

      // Update light and sight source after the animation finished if Vision Animation is disabled
      if ( !game.settings.get("core", "visionAnimation") ) {
        const initializeSources = () => {
          const positionChanged = ("x" in changed) || ("y" in changed);
          const elevationChanged = "elevation" in changed;
          const rotationChanged = "rotation" in changed;
          const sizeChanged = ("width" in changed) || ("height" in changed);
          const perspectiveChanged = positionChanged || elevationChanged || sizeChanged
            || (rotationChanged && this.hasLimitedSourceAngle);
          const visionChanged = perspectiveChanged && this.hasSight;
          const lightChanged = perspectiveChanged && this._isLightSource();
          if ( visionChanged || lightChanged ) this.initializeSources();
        };
        if ( movementAnimationPromise ) movementAnimationPromise.finally(initializeSources);
        else initializeSources();
      }

      // Calculate movement duration
      movementAnimationDuration = 0;
      const context = this._PRIVATE_animationContexts.get(this.movementAnimationName);
      if ( context ) {
        movementAnimationDuration = context.duration;
        for ( const {options: {duration}} of context.chain ) movementAnimationDuration += duration;
        movementAnimationDuration = Math.max(movementAnimationDuration - context.time, 0);
      }

      // Calculate the duration after which the movement is to be continued
      const movementContinuationDuration = this.document.movement.state !== "pending"
        ? movementAnimationDuration : Math.max(movementAnimationDuration - (2 * game.time.averageLatency) - 50, 0);

      // Unblock keyboard movement 500 ms before the movement animation ends or the movement would be continued,
      // but not before the previous movement animation completed
      if ( movementAnimationPromise ) {
        const movementId = movement.id;
        Promise.allSettled([
          previousMovementAnimationPromise ?? Promise.resolve(),
          Promise.race([movementAnimationPromise, new Promise(resolve => {
            setTimeout(resolve, Math.max(movementContinuationDuration - 500, 0));
          })])
        ]).finally(() => {
          if ( movementId !== this.document.movement.id ) return;
          this._preventKeyboardMovement = false;
        });
      } else {
        this._preventKeyboardMovement = false;
      }

      // Create promise for when to continue movement
      this.document._movementContinuation.waitPromise = new Promise(resolve => {

        // If no animation or browser tab inactive, resolve immediately
        if ( !movementAnimationPromise || window.document.hidden ) {
          this.document._movementContinuation.resolveWaitPromise = () => {};
          resolve();
          return;
        }

        // Otherwise resolve once the browser tab becomes inactive, the movement animation
        // resolves or the movement continuation timeout has completed
        let visibilitychange = event => {
          if ( window.document.hidden ) callback();
        };
        const callback = () => {
          if ( !visibilitychange ) return;
          window.document.removeEventListener("visibilitychange", visibilitychange);
          visibilitychange = undefined;
          resolve();
        };
        window.document.addEventListener("visibilitychange", visibilitychange);
        this.document._movementContinuation.resolveWaitPromise = callback;
        movementAnimationPromise.finally(callback);
        setTimeout(callback, movementContinuationDuration);
      });
    }

    // Set the duration of non-movement properties to the animation duration of movement if requested
    const {linkToMovement, ...animationOptions} = options.animation ?? {};
    if ( (linkToMovement === true) && (movementAnimationDuration !== undefined) ) {
      animationOptions.duration ??= movementAnimationDuration;
    }

    // Dispatch the animation
    // noinspection ES6MissingAwait
    this.animate(to, animationOptions);
  };

  /* -------------------------------------------- */

  /**
   * Handle TOKEN_ANIMATE_IN/_OUT region events.
   * @param {TokenPosition} origin                                                                The origin of movement
   * @param {(TokenPosition & {regions: Set<RegionDocument>})[]} animationPath                    The animation path
   * @param {Set<RegionDocument>} initialRegions                                                  The initial regions
   * @param {{start: Promise<void>; end: Promise<void>; duration: number}[]} runningAnimations    The running animations
   */
  _PRIVATE_handleAnimateInOutRegionEvents(origin, animationPath, initialRegions, runningAnimations) {
    let from = origin;
    let activeRegions = initialRegions;
    for ( let i = 0; i < animationPath.length; i++ ) {
      const to = animationPath[i];
      const regionsIn = to.regions.difference(activeRegions);
      const regionsOut = activeRegions.difference(to.regions);
      const eventDataOut = {
        token: this.document,
        position: {
          x: from.x,
          y: from.y,
          elevation: from.elevation,
          width: from.width,
          height: from.height,
          shape: from.shape
        }
      };
      const handleRegionEventsOut = () => {
        for ( const region of regionsOut ) {
          region._handleEvent({
            name: CONST.REGION_EVENTS.TOKEN_ANIMATE_OUT,
            data: eventDataOut,
            region,
            user: game.user
          });
        }
      };
      const promiseOut = runningAnimations[i].start;
      if ( promiseOut ) promiseOut.finally(handleRegionEventsOut);
      else handleRegionEventsOut();
      const eventDataIn = {
        token: this.document,
        position: {
          x: to.x,
          y: to.y,
          elevation: to.elevation,
          width: to.width,
          height: to.height,
          shape: to.shape
        }
      };
      const handleRegionEventsIn = () => {
        for ( const region of regionsIn ) {
          region._handleEvent({
            name: CONST.REGION_EVENTS.TOKEN_ANIMATE_IN,
            data: eventDataIn,
            region,
            user: game.user
          });
        }
      };
      const promiseIn = i > 0 ? runningAnimations[i - 1].end : undefined;
      if ( promiseIn ) promiseIn.finally(handleRegionEventsIn);
      else handleRegionEventsIn();
      from = to;
      activeRegions = to.regions;
    }
  };

  /* -------------------------------------------- */

  /**
   * Automatically pan the canvas when a controlled Token moves offscreen.
   */
  _PRIVATE_panCanvas() {

    // Target center point in screen coordinates
    const c = this.center;
    const {x: sx, y: sy} = canvas.stage.transform.worldTransform.apply(c);

    // Screen rectangle minus padding space
    const pad = 50;
    const sidebarPad = document.getElementById("sidebar").clientWidth + pad;
    const rect = new PIXI.Rectangle(pad, pad, window.innerWidth - sidebarPad, window.innerHeight - pad);

    // Pan the canvas if the target center-point falls outside the screen rect
    if ( !rect.contains(sx, sy) ) canvas.animatePan(this.center);
  };

  /* -------------------------------------------- */

  /**
   * Add/Modify a filter effect on this token.
   * @param {string} statusId       The status effect ID being applied, from {@link CONFIG.specialStatusEffects}
   * @param {boolean} active        Is the special status effect now active?
   * @internal
   */
  _configureFilterEffect(statusId, active) {
    let filterClass = null;
    const filterUniforms = {};

    // TODO: The filter class should be into CONFIG with specialStatusEffects or conditions.
    switch ( statusId ) {
      case CONFIG.specialStatusEffects.INVISIBLE:
        filterClass = InvisibilityFilter;
        break;
    }
    if ( !filterClass ) return;

    const target = this.mesh;
    target.filters ??= [];

    // Is a filter active for this id?
    let filter = this._PRIVATE_filterEffects.get(statusId);
    if ( !filter && active ) {
      filter = filterClass.create(filterUniforms);

      // Push the filter and set the filter effects map
      target.filters.push(filter);
      this._PRIVATE_filterEffects.set(statusId, filter);
    }
    else if ( filter ) {
      filter.enabled = active;
      foundry.utils.mergeObject(filter.uniforms, filterUniforms, {
        insertKeys: false,
        overwrite: true,
        enforceTypes: true
      });
      if ( active && !target.filters.find(f => f === filter) ) target.filters.push(filter);
    }
  };

  /* -------------------------------------------- */

  /**
   * Remove all filter effects on this placeable.
   * @internal
   */
  _removeAllFilterEffects() {
    const target = this.mesh;
    if ( target?.filters?.length ) {
      for ( const filterEffect of this._PRIVATE_filterEffects.values() ) {
        target.filters.findSplice(f => f === filterEffect);
      }
    }
    this._PRIVATE_filterEffects.clear();
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeDragLeft(event) {
    super._initializeDragLeft(event);

    // This token is now dragged
    this.layer._draggedToken = this;

    // Initialize the drag contexts
    const contexts = event.interactionData.contexts = {};
    for ( const clone of event.interactionData.clones ) {
      const token = clone._original;

      // Create the drag context
      contexts[token.document.id] = token._PRIVATE_initializeDragContext(event, clone);

      // Update planned movement
      token._PRIVATE_updatePlannedMovement();
    }

    // Initialize waypoint mode
    event.interactionData.dropped = false;
    event.interactionData.cancelled = false;
    event.interactionData.released = false;
  };

  /* -------------------------------------------- */

  /**
   * Initialize the drag context for this Token.
   * @param {PIXI.FederatedEvent} event    The pointermove event
   * @param {Token} clonedToken            The preview token
   * @returns {TokenDragContext}           The drag context
   */
  _PRIVATE_initializeDragContext(event, clonedToken) {
    const {x, y, elevation, width, height, shape} = this.document._source;
    let snapped = false;
    if ( !canvas.grid.isGridless ) {
      const snappedPosition = this.document.getSnappedPosition({x, y, elevation, width, height, shape});
      snapped = (x === Math.round(snappedPosition.x)) && (y === Math.round(snappedPosition.y))
        && (elevation.almostEqual(snappedPosition.elevation));
    }
    const origin = {x, y, elevation, width, height, shape};
    const destination = {x, y, elevation, width, height, shape, action: this.document.movementAction,
      snapped, explicit: true, checkpoint: true};
    return {
      token: this,
      clonedToken,
      origin,
      destination,
      waypoints: [],
      foundPath: [destination],
      unreachableWaypoints: [],
      hidden: event.altKey,
      updating: false,
      search: null,
      searching: false,
      searchId: 0
    };
  };

  /* -------------------------------------------- */

  /**
   * Get the context of the current drag workflow for this Token.
   * @returns {TokenDragContext|void}    The drag context if the Token is being dragged
   */
  _PRIVATE_getDragContext() {
    if ( this.isPreview ) return;
    const context = this.layer._draggedToken?.mouseInteractionManager.interactionData.contexts[this.document.id];
    if ( context ) return context;
  };

  /* -------------------------------------------- */

  /**
   * Is this a preview of drag operation and the destination is unreachable?
   * @type {boolean}
   */
  get _PRIVATE_isUnreachableDragPreview() {
    if ( !this.isPreview ) return false;
    const context = this.layer._draggedToken?.mouseInteractionManager.interactionData.contexts[this.document.id];
    if ( !context ) return false;
    return context.unreachableWaypoints.length > 0;
  };

  /* -------------------------------------------- */

  /**
   * Update the destinations of the drag previews and rulers
   * @param {Point} point                     The (unsnapped) center point of the waypoint
   * @param {object} [options]                Additional options
   * @param {boolean} [options.snap=false]    Snap the destination?
   * @protected
   */
  _updateDragDestination(point, {snap=false}={}) {
    const contexts = Object.values(this.mouseInteractionManager.interactionData.contexts);
    if ( canvas.grid.isGridless ) snap = false;

    // Determine dragged distance
    const origin = this._getDragOrigin();
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;

    // Update the destinations
    for ( const context of contexts ) {
      const {x, y} = context.token.document._source;
      const destination = context.token._getDragWaypointPosition(context.destination, {x: x + dx, y: y + dy}, {snap});
      // The movement action is set in NonPrivateToken._PRIVATE_recalculatePlannedMovementPath
      destination.action = undefined;
      // Elevation is ignored here, but is considered in NonPrivateToken._PRIVATE_recalculatePlannedMovementPath
      destination.snapped = snap;
      destination.explicit = true;
      destination.checkpoint = true;
      if ( Object.keys(context.destination).every(k => context.destination[k] === destination[k]) ) continue;
      context.destination = destination;

      // Update the position of the preview token
      NonPrivateToken._PRIVATE_updateDragPreview(context.clonedToken, destination);

      // Update the ruler path
      NonPrivateToken._PRIVATE_recalculatePlannedMovementPath(context);
    }
  };

  /* -------------------------------------------- */

  /**
   * Add ruler waypoints and update ruler paths.
   * @param {Point} point                     The (unsnapped) center point of the waypoint
   * @param {object} [options]                Additional options
   * @param {boolean} [options.snap=false]    Snap the added waypoint?
   * @protected
   */
  _addDragWaypoint(point, {snap=false}={}) {
    const contexts = Object.values(this.mouseInteractionManager.interactionData.contexts);
    if ( canvas.grid.isGridless ) snap = false;

    // Determine dragged distance
    const origin = this._getDragOrigin();
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;

    // Add waypoints and update ruler paths
    let redundantWaypoint = true;
    for ( const context of contexts ) {
      const {x, y} = context.origin;
      const waypoint = context.token._getDragWaypointPosition(context.destination, {x: x + dx, y: y + dy}, {snap});
      waypoint.action = context.token._getDragMovementAction();
      waypoint.snapped = snap && context.destination.elevation.almostEqual(waypoint.elevation);
      waypoint.explicit = true;
      waypoint.checkpoint = true;
      context.waypoints.push(waypoint);

      const lastWaypoint = context.waypoints.at(-2) ?? context.origin;
      if ( !TokenDocument.arePositionsEqual(lastWaypoint, waypoint) ) {
        NonPrivateToken._PRIVATE_recalculatePlannedMovementPath(context);
        redundantWaypoint = false;
      } else if ( lastWaypoint.snapped !== waypoint.snapped ) {
        lastWaypoint.snapped = waypoint.snapped;
        NonPrivateToken._PRIVATE_recalculatePlannedMovementPath(context);
      }
    }

    // If the waypoint is matching the last waypoint for all rulers,
    // remove that were waypoints that were just added
    if ( redundantWaypoint ) contexts.forEach(context => context.waypoints.pop());
  };

  /* -------------------------------------------- */

  /**
   * Remove last ruler waypoints and update ruler paths.
   * @protected
   */
  _removeDragWaypoint() {

    // Update those ruler that have their path changed
    for ( const context of Object.values(this.mouseInteractionManager.interactionData.contexts) ) {

      // If one ruler has no waypoints, all of them have none: cancel the drag workflow
      if ( context.waypoints.length === 0 ) {
        this._triggerDragLeftCancel();
        break;
      }

      // Recalculate path if the waypoints change
      const previousWaypoint = context.waypoints.at(-2) ?? context.origin;
      const lastWaypoint = context.waypoints.pop();
      if ( !TokenDocument.arePositionsEqual(lastWaypoint, previousWaypoint) ) {
        NonPrivateToken._PRIVATE_recalculatePlannedMovementPath(context);
      }
    }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  _finalizeDragLeft(event) {

    // This token is no longer dragged
    this.layer._draggedToken = null;

    // Reset the movement action override
    this.layer._dragMovementAction = null;

    // Cancel path searches and refesh ruler visualization
    for ( const context of Object.values(event.interactionData.contexts) ) {
      context.search?.cancel();
      context.token._PRIVATE_updatePlannedMovement();
    }

    super._finalizeDragLeft(event);
  };

  /* -------------------------------------------- */

  /**
   * Change the elevation of the dragged Tokens.
   * @param {number} delta                       The number vertical steps
   * @param {object} [options]                   Additional options
   * @param {boolean} [options.precise=false]    Round elevations to multiples of the grid distance divided by
   *                                             `CONFIG.Canvas.elevationSnappingPrecision`?
   *                                             If false, rounds to multiples of the grid distance.
   * @protected
   */
  _changeDragElevation(delta, {precise=false}={}) {

    // Calculate the elevation interval and delta
    const interval = canvas.dimensions.distance / (precise ? CONFIG.Canvas.elevationSnappingPrecision : 1);

    // Update the destination elevation of each ruler
    for ( const context of Object.values(this.mouseInteractionManager.interactionData.contexts) ) {
      const elevation = (context.destination.elevation + (delta * interval)).toNearest(interval, delta > 0 ? "floor" : "ceil");
      const destination = context.token._getDragWaypointPosition(context.destination, {elevation},
        {snap: context.destination.snap});
      if ( TokenDocument.arePositionsEqual(context.destination, destination) ) continue;
      for ( const k of TokenDocument.MOVEMENT_FIELDS ) context.destination[k] = destination[k];

      // Update the destination of the preview token
      NonPrivateToken._PRIVATE_updateDragPreview(context.clonedToken, destination);

      // Update the ruler path
      NonPrivateToken._PRIVATE_recalculatePlannedMovementPath(context);
    }
  };

  /* -------------------------------------------- */

  /**
   * Update the position of the preview token.
   * @param {Token} preview                         The preview token
   * @param {Partial<TokenPosition>} destination    The destination
   */
  static _PRIVATE_updateDragPreview(preview, destination) {
    const source = preview._original.document._source;
    const {x=source.x, y=source.y, elevation=source.elevation, width=source.width, height=source.height,
      shape=source.shape} = destination;
    const refreshPosition = (preview.document.x !== x) || (preview.document.y !== y);
    const refreshElevation = preview.document.elevation !== elevation;
    const refreshSize = (preview.document.width !== width) || (preview.document.height !== height);
    const refreshShape = preview.document.shape !== shape;
    preview.document.x = x;
    preview.document.y = y;
    preview.document.elevation = elevation;
    preview.document.width = width;
    preview.document.height = height;
    preview.document.shape = shape;
    preview.renderFlags.set({refreshPosition, refreshElevation, refreshSize, refreshShape});
  };

  /* -------------------------------------------- */

  /**
   * Cancel the drag workflow if this Token is the one the drag operation was initiated on, or
   * otherwise remove this Token from the drag operation if it is being part of it.
   */
  _PRIVATE_cancelDrag() {
    if ( !this.layer._draggedToken ) return; // No drag workflow
    if ( this.isPreview ) return; // Previews cannot be dragged

    // If this token is the dragged token, cancel the drag workflow
    if ( this.layer._draggedToken === this ) {
      this._triggerDragLeftCancel();
      return;
    }

    // If this token not the dragged token but part of a drag operation,...
    const interactionData = this.layer._draggedToken.mouseInteractionManager.interactionData;
    const context = interactionData.contexts[this.document.id];
    if ( !context ) return;

    // ... cancel pathfinding, delete the drag context, and destroy the preview token
    context.search?.cancel();
    delete interactionData.contexts[this.document.id];
    interactionData.clones.findSplice(clone => clone === context.clonedToken);
    context.clonedToken._onDragEnd();
    context.clonedToken.destroy({children: true});
  };

  /* -------------------------------------------- */

  /**
   * Recalculate the planned movement path of this Token for the current User.
   */
  recalculatePlannedMovementPath() {
    const context = this._PRIVATE_getDragContext();
    if ( !context || context.updating ) return;
    context.updating = true;
    context.search?.cancel();
    canvas.app.ticker.addOnce(() => {
      context.updating = false;
      NonPrivateToken._PRIVATE_recalculatePlannedMovementPath(context);
    }, undefined, PIXI.UPDATE_PRIORITY.OBJECTS + 2);
  };

  /* -------------------------------------------- */

  /**
   * Update the planned movement path.
   * @param {TokenDragContext} context    The drag context
   */
  static _PRIVATE_recalculatePlannedMovementPath(context) {
    if ( context.updating ) return;

    // Cancel current pathfinding job
    context.search?.cancel();

    // Remove repeating explicit waypoints
    const explicitWaypoints = [{...context.origin}];
    const destination = {...context.destination};
    destination.action = context.token._getDragMovementAction();
    destination.snapped &&= destination.elevation.almostEqual(
      context.token.document.getSnappedPosition(destination).elevation);
    for ( const {x, y, elevation, width=context.origin.width, height=context.origin.height, shape=context.origin.shape,
      action, snapped, explicit, checkpoint} of [...context.waypoints, destination] ) {
      const waypoint = {x, y, elevation, width, height, shape, action, snapped, explicit, checkpoint};
      const lastWaypoint = explicitWaypoints.at(-1);
      if ( TokenDocument.arePositionsEqual(lastWaypoint, waypoint) ) continue;
      explicitWaypoints.push(waypoint);
    }

    // Reuse parts of the previous found path that pass through the current explicit waypoints
    let lastReachedWaypointIndex = 0;
    let reachableWaypoints = 0;
    for ( let i = 0; (i < context.foundPath.length) && (reachableWaypoints < explicitWaypoints.length); i++ ) {
      const waypoint = context.foundPath[i];
      const explicitWaypoint = explicitWaypoints[reachableWaypoints];
      if ( TokenDocument.arePositionsEqual(explicitWaypoint, waypoint) ) {
        reachableWaypoints++;
        lastReachedWaypointIndex = i;
      }
    }
    context.foundPath = context.foundPath.slice(0, lastReachedWaypointIndex + 1);
    context.unreachableWaypoints = explicitWaypoints.slice(reachableWaypoints);
    context.searching = true;

    // Start new pathfinding job
    context.searchId += 1;
    const searchId = context.searchId;
    const searchStartTime = canvas.app.ticker.lastTime;
    if ( context.token.ruler ) {
      const searchOptions = context.token._getDragPathfindingOptions();
      context.search = context.token.findMovementPath(explicitWaypoints, searchOptions);
    } else {
      const foundPath = [];
      for ( const {x, y, elevation, width=context.origin.width, height=context.origin.height,
        shape=context.origin.shape, action=context.token.document.movementAction, snapped=false,
        explicit=false, checkpoint=false} of explicitWaypoints ) {
        foundPath.push({x, y, elevation, width, height, shape, action, snapped, explicit, checkpoint});
      }
      context.search = {
        result: foundPath,
        promise: Promise.resolve(foundPath),
        cancel: () => {}
      };
    }

    // Handle result of pathfinding job
    const handleResult = async foundPath => {
      if ( !foundPath || (context.searchId !== searchId) ) return; // Search was cancelled
      if ( context.token.destroyed || context.clonedToken.destroyed ) return;

      // If the path was found quickly but not before the the first frame was rendered with the search animation,
      // delay refreshing the ruler to prevent very brief flickering
      const elapsedTime = canvas.app.ticker.lastTime - searchStartTime;
      if ( elapsedTime > 0 ) {
        const minDuration = 500; // The minimum duration of the search animation
        if ( elapsedTime < minDuration ) {
          await new Promise(resolve => {
            setTimeout(resolve, minDuration - elapsedTime);
          });

          // Another pathfinding job was started while we delayed
          if ( context.searchId !== searchId ) return;
        }
      }

      // Identify reachable waypoints, which are those that passed through by the found path
      let reachableWaypoints = 0;
      for ( const waypoint of foundPath ) {
        const explicitWaypoint = explicitWaypoints[reachableWaypoints];
        if ( TokenDocument.arePositionsEqual(explicitWaypoint, waypoint) ) reachableWaypoints++;
      }
      context.foundPath = foundPath;
      context.unreachableWaypoints = explicitWaypoints.slice(reachableWaypoints);
      context.searching = false;

      // Update planned movement
      context.token._PRIVATE_updatePlannedMovement();
    };

    // Handle the search result immediately if the path was found instantly
    if ( context.search.result !== undefined ) handleResult(context.search.result);

    // Otherwise handle the result once the path is found
    else {
      context.search.promise.then(handleResult);

      // Update planned movement just before the next frame is rendered so that we don't broadcast
      // a state where searching is in progress when we find the path before the next frame
      canvas.app.ticker.addOnce(() => {
        if ( context.searching && (context.searchId === searchId) ) context.token._PRIVATE_updatePlannedMovement();
      }, undefined, PIXI.UPDATE_PRIORITY.OBJECTS + 1);
    }
  };

  /* -------------------------------------------- */

  /**
   * Update the planned movement for the current user.
   */
  _PRIVATE_updatePlannedMovement() {
    const context = this._PRIVATE_getDragContext();
    if ( !context ) {
      if ( game.user.id in this._plannedMovement ) {
        delete this._plannedMovement[game.user.id];
        this.renderFlags.set({refreshRuler: true, refreshState: true});
        this._PRIVATE_throttleBroadcastPlannedMovement();
      }
      return;
    }

    // Add drag ruler state for the current user
    const foundPath = this.document.getCompleteMovementPath(
      this.createTerrainMovementPath(context.foundPath, {preview: true}));
    const unreachableWaypoints = this.document.getCompleteMovementPath(
      this.createTerrainMovementPath([foundPath.at(-1), ...context.unreachableWaypoints], {preview: true})).slice(1);
    const combinedPath = [...this.document.movementHistory, ...foundPath, ...unreachableWaypoints];
    const measurement = this.measureMovementPath(combinedPath, {preview: true});
    for ( let i = this.document.movementHistory.length; i < combinedPath.length; i++ ) {
      const waypoint = combinedPath[i];
      waypoint.cost = measurement.waypoints[i].backward?.cost ?? 0;
    }

    // Configure the origin of the found path based on the last recorded waypoint
    const current = this.document.movementHistory.at(-1);
    const origin = foundPath[0];
    origin.action = (current !== undefined) && !TokenDocument.arePositionsEqual(current, origin)
      ? "displace" : (current?.action ?? foundPath[0].action);
    origin.terrain = null;
    origin.snapped = false;
    origin.explicit = false;
    origin.checkpoint = true;
    origin.cost = 0;

    // Update planned movement and broadcast if it changed
    const previousPlannedMovement = this._plannedMovement[game.user.id];
    const plannedMovement = {foundPath, unreachableWaypoints, history: this.document.movementHistory,
      hidden: context.hidden, searching: context.searching};
    if ( foundry.utils.objectsEqual(previousPlannedMovement, plannedMovement) ) return;
    this._plannedMovement[game.user.id] = plannedMovement;
    this._PRIVATE_throttleBroadcastPlannedMovement();

    // Refresh ruler and state
    this.renderFlags.set({refreshRuler: true, refreshState: !previousPlannedMovement});

    // Update the center offset of the preview token
    context.clonedToken._PRIVATE_centerOffset.x = this._PRIVATE_centerOffset.x;
    context.clonedToken._PRIVATE_centerOffset.y = this._PRIVATE_centerOffset.y;
    context.clonedToken._PRIVATE_updateCenterOffset(origin, foundPath.slice(1).concat(unreachableWaypoints));
    context.clonedToken._PRIVATE_animationCenterOffset.x = context.clonedToken._PRIVATE_centerOffset.x;
    context.clonedToken._PRIVATE_animationCenterOffset.y = context.clonedToken._PRIVATE_centerOffset.y;

    // Update light and/or vision sources of the preview token if Token Drag Preview is enabled
    if ( game.settings.get("core", "tokenDragPreview") ) {
      context.clonedToken.initializeSources();
      canvas.perception.update({refreshLighting: true, refreshVision: true});
    } else {
      context.clonedToken._PRIVATE_adjustedCenter = context.clonedToken.getMovementAdjustedPoint(
        context.clonedToken.document.getCenterPoint());
    }
  };

  /* -------------------------------------------- */

  /**
   * A throttled function that broadcasts the planned movement.
   * @type {() => void}
   */
  _PRIVATE_throttleBroadcastPlannedMovement = foundry.utils.throttle(this._PRIVATE_broadcastPlannedMovement.bind(this), 100);

  /* -------------------------------------------- */

  /**
   * Broadcast the planned movement.
   */
  _PRIVATE_broadcastPlannedMovement() {
    game.user.broadcastActivity({plannedMovements: {[this.document.id]: game.user.hasPermission("SHOW_RULER")
      ? (this._plannedMovement[game.user.id] ?? null) : null}});
  };

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  updateSource({deleted=false}={}) {
    const msg = "Token_PRIVATE_updateSource has been deprecated in favor of Token_PRIVATE_initializeSources";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    this.initializeSources({deleted});
  };

  /**
   * @deprecated since v12
   * @ignore
   */
  getCenter(x, y) {
    const msg = "Token_PRIVATE_getCenter(x, y) has been deprecated in favor of Token_PRIVATE_getCenterPoint(Point).";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14, once: true});
    return this.getCenterPoint(x !== undefined ? {x, y} : undefined);
  };

  /**
   * @deprecated since v12
   * @ignore
   */
  get owner() {
    const msg = "Token_PRIVATE_owner has been deprecated. Use Token_PRIVATE_isOwner instead.";
    foundry.utils.logCompatibilityWarning(msg, {since: 12, until: 14});
    return this.isOwner;
  };

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  async toggleCombat(combat) {
    foundry.utils.logCompatibilityWarning("Token_PRIVATE_toggleCombat is deprecated in favor of TokenDocument_PRIVATE_toggleCombatant,"
      + " TokenDocument.implementation.createCombatants, and TokenDocument.implementation.deleteCombatants", {since: 12, until: 14});
    const tokens = canvas.tokens.controlled.map(t => t.document);
    if ( !this.controlled ) tokens.push(this.document);
    if ( this.inCombat ) await TokenDocument.implementation.deleteCombatants(tokens);
    else await TokenDocument.implementation.createCombatants(tokens);
  };

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  async toggleEffect(effect, {active, overlay=false}={}) {
    foundry.utils.logCompatibilityWarning("Token_PRIVATE_toggleEffect is deprecated in favor of Actor_PRIVATE_toggleStatusEffect",
      {since: 12, until: 14});
    if ( !this.actor || !effect.id ) return false;
    return this.actor.toggleStatusEffect(effect.id, {active, overlay});
  };

  /* -------------------------------------------- */

  /**
   * @deprecated since v12
   * @ignore
   */
  async toggleVisibility() {
    foundry.utils.logCompatibilityWarning("Token_PRIVATE_toggleVisibility is deprecated without replacement in favor of"
      + " updating the hidden field of the TokenDocument directly.", {since: 12, until: 14});
    const isHidden = this.document.hidden;
    const tokens = this.controlled ? canvas.tokens.controlled : [this];
    const updates = tokens.map(t => { return {_id: t.id, hidden: !isHidden};});
    return canvas.scene.updateEmbeddedDocuments("Token", updates);
  };

  /* -------------------------------------------- */

  /**
   * @deprecated since v12 Stable 4
   * @ignore
   */
  _recoverFromPreview() {
    foundry.utils.logCompatibilityWarning("Token_PRIVATE__recoverFromPreview is deprecated without replacement in favor of"
      + " recovering from preview directly into TokenConfig_PRIVATE__resetPreview.", {since: 12, until: 14});
    this.renderable = true;
    this.initializeSources();
    this.control();
  };

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  testInsideRegion(region, position) {
    foundry.utils.logCompatibilityWarning("Token_PRIVATE_testInsideRegion is deprecated "
      + "in favor of TokenDocument_PRIVATE_testInsideRegion.", {since: 13, until: 15});
    return this.document.testInsideRegion(region.document, position);
  };

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  segmentizeRegionMovement(region, waypoints, options) {
    foundry.utils.logCompatibilityWarning("Token_PRIVATE_segmentizeRegionMovement is deprecated "
      + "in favor of TokenDocument_PRIVATE_segmentizeRegionMovementPath.", {since: 13, until: 15});
    if ( options?.teleport !== undefined ) {
      waypoints = waypoints.map(waypoint => {
        waypoint = {...waypoint};
        waypoint.action ??= (options.teleport ? "displace" : this.document.movementAction);
        return waypoint;
      });
    }
    return this.document.segmentizeRegionMovementPath(region.document, waypoints);
  };

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  getSize() {
    foundry.utils.logCompatibilityWarning("Token_PRIVATE_getSize is deprecated in favor of TokenDocument_PRIVATE_getSize.", {since: 13, until: 14, once: true});
    return this.document.getSize();
  };

  /* -------------------------------------------- */

  /**
   * @deprecated since v13
   * @ignore
   */
  get target() {
    foundry.utils.logCompatibilityWarning("Token_PRIVATE_target is deprecated and has been split into two new graphics "
      + "object: targetArrows and targetPips. targetArrows is returned by the deprecated target property.", {since: 13, until: 14, once: true});
    return this.targetArrows;
  };
}
}

