/*
 * The camera of each frame: a phone's (perspective), looking at the object
 * from a little way off and usually from above.
 *
 * The object's frame: y up, its turning axis on y, its base at y = 0. A
 * frame saw it turned by `angle` about y (x' = x cos + z sin, z' = -x sin
 * + z cos) from a camera at (tx, hc, d) in that turned frame, pitched down
 * by `pitch`, with focal length f (pixels of the mask) and the picture's
 * centre at (cx, cy):
 *   r = (x' - tx, y - hc, z' - d)
 *   depth = -r.y sin(pitch) - r.z cos(pitch)
 *   u = cx + f r.x / depth,   v = cy - f (r.y cos(pitch) - r.z sin(pitch)) / depth
 *
 * The focal length and the pitch are not known; each guess pins the rest
 * from where the object stands in the frame (its axis, base and top), and
 * the carving tries a few guesses and keeps the one whose shape explains
 * the outlines best (fitCamera in carve.js).
 */

/**
 * The cameras for frames, from their place in the picture (views: axis,
 * base, scale from pose.js) and a guess at the focal length (in units of
 * the frame's longer side) and pitch (radians).
 * @returns {object[]} per frame { angle, f, cx, cy, tx, hc, d, cp, sp, scale }
 */
export function makeCameras(views, W, H, Href, { focal, pitch }) {
  const f = focal * Math.max(W, H);
  const cx = W / 2; const cy = H / 2;
  const cp = Math.cos(pitch); const sp = Math.sin(pitch);
  return views.map((v) => {
    const heightPx = Href / v.scale;
    const tb = (v.base - cy) / f;
    const tt = (v.base - heightPx - cy) / f;
    // With the camera 1 away: its height over the base, and the object's height.
    const den = cp - tb * sp;
    const hc1 = (sp + tb * cp) / (Math.abs(den) > 1e-6 ? den : 1e-6);
    const den2 = tt * sp - cp;
    const h1 = hc1 + (tt * cp + sp) / (Math.abs(den2) > 1e-6 ? den2 : -1e-6);
    const sc = h1 > 1e-6 ? Href / h1 : Href;
    const zb = hc1 * sp + cp;
    const tx1 = ((cx - v.axis) * zb) / f;
    const d = sc; const hc = hc1 * sc; const tx = tx1 * sc;
    return {
      angle: v.angle || 0, f, cx, cy, tx, hc, d, cp, sp, pitch, focal,
      // Units per pixel near the axis (for sizes: blur, splats, tolerances).
      scale: (zb * sc) / f,
      axis: v.axis, base: v.base,
    };
  });
}

/**
 * A projector for one camera: (x, y, z, out) sets out[0] = u, out[1] = v
 * (mask pixels) and out[2] = depth (object units; nearer is smaller).
 */
export function projector(cam) {
  const c = Math.cos(cam.angle); const s = Math.sin(cam.angle);
  const {
    f, cx, cy, tx, hc, d, cp, sp,
  } = cam;
  return (x, y, z, out) => {
    const rx = x * c + z * s - tx;
    const ry = y - hc;
    const rz = -x * s + z * c - d;
    const depth = -ry * sp - rz * cp;
    const inv = depth > 1e-6 ? 1 / depth : 1e6;
    out[0] = cx + f * rx * inv;
    out[1] = cy - f * (ry * cp - rz * sp) * inv;
    out[2] = depth;
  };
}

/** Where the camera stands, in the object's own frame (for which way a point faces it). */
export function cameraCentre(cam) {
  const c = Math.cos(cam.angle); const s = Math.sin(cam.angle);
  // x' = x c + z s, z' = -x s + z c, so x = x' c - z' s, z = x' s + z' c.
  return [cam.tx * c - cam.d * s, cam.hc, cam.tx * s + cam.d * c];
}
