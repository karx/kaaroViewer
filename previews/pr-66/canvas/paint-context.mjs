/**
 * canvas/paint-context.mjs — assembles PaintContext from live state at paint trigger time.
 *
 * PaintContext {
 *   slideIdx:     number | null   — active slide index (null = global paint)
 *   slideType:    string | null   — 'title'|'briefing'|'beat'|'insight'|'cluster'|...
 *   slideCentral: Node | null     — first frameNode of the slide (the subject)
 *   slideNodes:   Node[]          — all frameNodes from the slide definition
 *   cameraAngle:  { azimuth, elevation, phrase, compass } | null
 *   visibleNodes: Node[]          — nodes inside camera frustum at trigger time
 *   selectedNode: Node | null     — entity currently focused in detail panel
 * }
 */

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * Describe the live camera's angle as a structured object + a prose phrase
 * suitable for injecting into a Gemini image prompt.
 */
export function describeCameraAngle(camera) {
  const p      = camera.position;
  const horiz  = Math.sqrt(p.x * p.x + p.z * p.z);
  const elev   = Math.atan2(p.y, horiz) * (180 / Math.PI);
  const az     = Math.atan2(p.x, p.z)   * (180 / Math.PI);

  let phrase;
  if (elev > 55)       phrase = 'aerial overhead view';
  else if (elev > 25)  phrase = 'high angle establishing shot';
  else if (elev > -10) phrase = 'eye-level cinematic shot';
  else                 phrase = 'low angle, looking upward';

  const compass = COMPASS[Math.round(((az % 360) + 360) % 360 / 45) % 8];

  return { azimuth: az, elevation: elev, phrase, compass };
}

/**
 * Assemble a PaintContext object from live application state.
 *
 * All fields are optional — callers pass whatever they have; missing pieces
 * are set to safe defaults so strategies can always pattern-match against a
 * well-shaped object.
 *
 * @param {object} opts
 * @param {number|null}  opts.slideIdx
 * @param {string|null}  opts.slideType
 * @param {object|null}  opts.slideCentral   graph Node
 * @param {object[]}     opts.slideNodes     graph Nodes
 * @param {object|null}  opts.camera         THREE.Camera (live)
 * @param {object[]}     opts.visibleNodes   graph Nodes in camera frustum
 * @param {object|null}  opts.selectedNode   graph Node (getCurrentQid)
 */
export function assemblePaintContext({
  slideIdx     = null,
  slideType    = null,
  slideCentral = null,
  slideNodes   = [],
  camera       = null,
  visibleNodes = [],
  selectedNode = null,
} = {}) {
  return {
    slideIdx,
    slideType,
    slideCentral,
    slideNodes,
    cameraAngle:  camera ? describeCameraAngle(camera) : null,
    visibleNodes,
    selectedNode,
  };
}
