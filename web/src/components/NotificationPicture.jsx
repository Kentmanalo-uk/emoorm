import { useState } from 'react';
import { resolveImg } from '../lib/media';
import './NotificationPicture.css';

const initialsOf = (name) => String(name || '?').trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('')
  .toUpperCase();

/**
 * A notification's picture, as the shopping apps show it on the left: the
 * product (orders, returns, listings) or the shop in a rounded square, the
 * person (messages) in a circle, each with a small badge in the kind's
 * colour saying what it is. Without a picture, or when it fails to load:
 * the kind's own icon on its colour.
 *
 * `picture` is the API's { url, name, kind } (kind: product, store, person).
 * Colours: `tone` (green, blue, orange, amber, pink, red, slate, purple: a
 * solid tile, white icon) or `color` with a pale `bg` (the list's tiles);
 * `iconWeight` for the tile's icon (the list keeps its outlined ones).
 */
export default function NotificationPicture({
  picture, Icon, tone, color, bg, size = 44, className = '', iconWeight = 'fill',
}) {
  const [broken, setBroken] = useState(false);
  const style = {
    '--ntp-size': `${size}px`,
    ...(color ? { '--ntp-color': color } : {}),
    ...(bg ? { '--ntp-bg': bg, '--ntp-ink': color } : {}),
  };
  const tones = tone ? ` is-${tone}` : '';
  const url = picture?.url && !broken ? resolveImg(picture.url) : null;
  const person = picture?.kind === 'person';

  if (!picture || (!url && !person)) {
    return (
      <span className={`ntp ntp--icon${tones} ${className}`} style={style} aria-hidden="true">
        <Icon size={Math.round(size * 0.46)} weight={iconWeight} />
      </span>
    );
  }
  return (
    <span className={`ntp ntp--${person ? 'person' : 'thing'}${tones} ${className}`} style={style} aria-hidden="true">
      {url
        ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
        : <span className="ntp-initials">{initialsOf(picture.name)}</span>}
      <span className="ntp-badge">
        <Icon size={Math.max(10, Math.round(size * 0.24))} weight="fill" />
      </span>
    </span>
  );
}
