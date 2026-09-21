import { useState } from 'react';
import { resolveImg } from '../../lib/media';

/**
 * A person's picture, with the two things every avatar in the app needs.
 *
 * 1. The stored value is a backend path like `/uploads/x.webp`. The web app
 *    runs on its own origin in development, so that path has to be resolved
 *    against the API origin or the browser asks the wrong server and gets a
 *    404. Several call sites used the raw value and showed a broken image.
 * 2. A picture can fail to load anyway — a Google avatar when the network is
 *    down, a file removed from disk. Falling back to the person's initial is
 *    always better than a broken-image icon.
 *
 * The caller keeps its own wrapper element and class names; this renders
 * only what goes inside, so it drops into existing markup unchanged.
 *
 * @param {String} src - Stored photo path or absolute URL
 * @param {String} name - Display name, used for the initial and alt text
 * @param {String} [imgClassName] - Class for the <img>
 * @param {String} [fallbackClassName] - Class for the fallback <span>
 * @param {Function} [fallbackIcon] - Icon component to use instead of an initial
 * @param {Number} [iconSize] - Size for that icon
 */
export default function UserAvatar({
  src,
  name,
  imgClassName = '',
  fallbackClassName = '',
  fallbackIcon: Icon = null,
  iconSize = 18,
  alt,
}) {
  const [failed, setFailed] = useState(false);
  const resolved = src ? resolveImg(src) : null;

  if (resolved && !failed) {
    return (
      <img
        src={resolved}
        alt={alt ?? name ?? ''}
        className={imgClassName || undefined}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={fallbackClassName || undefined} aria-hidden={!name}>
      {Icon ? <Icon size={iconSize} weight="fill" /> : (name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}
