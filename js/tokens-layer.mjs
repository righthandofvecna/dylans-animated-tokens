import { MODULENAME } from "./utils.mjs";
import { getAllInFollowChain } from "./module-compatibility/follow-me.mjs";

/**
 * Extended TokenLayer for handling token collision detection
 */
export function register() {
  class TokenLayerPokemonAssets extends CONFIG.Canvas.layers.tokens.layerClass {
    /**
     * Determine whether the provided grid space is being occupied by a token which should block the provided token
     * @param {GridOffset3D} gridSpace            The grid space to check
     * @param {Token} token                       The token being moved
     * @param {object} [options]                  Additional options
     * @param {boolean} [options.preview=false]   Whether the movement in question is previewed
     * @returns {boolean} Whether the moving token should be blocked
     */
    isOccupiedGridSpaceBlocking(gridSpace, token, { preview=false }={}) {
      if (!game.settings.get(MODULENAME, "tokenCollision")) return false;
      
      const found = this.#getRelevantOccupyingTokens(gridSpace, token, { preview });
      
      return found.some(t => {
        // Friendly tokens behavior depends on settings
        const isAllied = token.document.disposition === t.document.disposition;
        if (isAllied && !game.settings.get(MODULENAME, "tokenCollisionAllied")) return false;

        // If token has any statuses that should never block movement, don't block movement
        // This could be expanded based on system-specific needs
        // For now, we'll just check basic conditions
        
        return true; // Block movement
      });
    }

    /* -------------------------------------------- */

    /**
     * Determine the set of tokens occupying the provided grid space which may be relevant for blocking/difficult terrain
     * considerations
     * @param {GridOffset3D} gridSpace            The grid space to check
     * @param {Token} token                       The token being moved
     * @param {object} [options]                  Additional options
     * @param {boolean} [options.preview=false]   Whether the movement in question is previewed
     * @returns {Set<Token>} The set of potentially relevant tokens occupying the provided grid space
     */
    #getRelevantOccupyingTokens(gridSpace, token, { preview=false }={}) {
      const grid = canvas.grid;
      if (grid.isGridless) return [];
      
      const topLeft = grid.getTopLeftPoint(gridSpace);
      const rect = new PIXI.Rectangle(topLeft.x, topLeft.y, grid.sizeX, grid.sizeY);
      const lowerElevation = gridSpace.k * grid.distance;
      const upperElevation = (gridSpace.k + 1) * grid.distance;
      
      // Get tokens in the follow chain to exclude them from collision
      const followChain = new Set(getAllInFollowChain(token.document));
      
      return game.canvas.tokens.quadtree.getObjects(rect, {
        collisionTest: ({ t }) => {
          // Ignore self
          if (t === token) return false;

          // Ignore tokens when moving together
          if (canvas.tokens.controlled.includes(t)) return false;

          // Ignore tokens in follow chain
          if (followChain.has(t.document)) return false;

          // Always ignore hidden tokens unless setting allows
          if (t.document.hidden && !game.settings.get(MODULENAME, "tokenCollisionHidden")) return false;

          // If preview movement, don't reveal blocked or difficult terrain for non-visible tokens
          if (preview && !t.visible) return false;

          // Ignore friendly tokens if setting disables blocking by allies
          const isAllied = token.document.disposition === t.document.disposition;
          if (isAllied && !game.settings.get(MODULENAME, "tokenCollisionAllied")) return false;

          // Always ignore secret tokens
          if (t.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET) return false;

          // Ignore different elevation
          const occupiedElevation = t.document._source.elevation;
          if ((occupiedElevation < lowerElevation) || (occupiedElevation >= upperElevation)) return false;

          // Ensure space is actually occupied, not merely touching border of rectangle
          const gridSpaces = t.document.getOccupiedGridSpaceOffsets(t.document._source);
          return gridSpaces.some(coord => (coord.i === gridSpace.i) && (coord.j === gridSpace.j));
        }
      });
    }
  }

  CONFIG.Canvas.layers.tokens.layerClass = TokenLayerPokemonAssets;
}
