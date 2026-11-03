import { resolveImg } from '../../lib/media';
import { brandColor, inkOn, initialsOf } from '../../lib/imageOverlays';
import { rgba, textOf } from '../../lib/photoDesign';

/**
 * One piece of a shop's own design, inside an .iov box (container-type:
 * size): centred on x, y (% of the box), sized in cqmin, turned and faded.
 * Drawn the same in the editor (with `editing`, where pieces take pointer
 * events) and over buyers' photos. Mirrors the app's CustomOverlay.
 */
export function DesignLayer({
  layer: l, store, selected = false, onPointerDown, children = null,
}) {
  const brand = brandColor(store);
  const style = {
    left: `${l.x}%`,
    top: `${l.y}%`,
    opacity: l.opacity,
    transform: `translate(-50%, -50%) rotate(${l.rotate || 0}deg)`,
  };
  const shadow = l.shadow ? 'drop-shadow(0 0.8cqmin 1.6cqmin rgba(0, 0, 0, 0.35))' : undefined;
  let body = null;

  if (l.type === 'text') {
    const pad = l.bg ? `${l.size * 0.28}cqmin ${l.size * 0.55}cqmin` : 0;
    body = (
      <span
        className="iov-c-text"
        style={{
          fontSize: `${l.size}cqmin`,
          fontWeight: l.weight,
          color: l.color,
          background: l.bg ? rgba(l.bg, l.bgOpacity ?? 1) : 'none',
          padding: pad,
          borderRadius: `${l.radius}cqmin`,
          textTransform: l.upper ? 'uppercase' : 'none',
          textShadow: l.shadow ? '0 0.4cqmin 1.4cqmin rgba(0, 0, 0, 0.45)' : 'none',
        }}
      >
        {textOf(l, store)}
      </span>
    );
  } else if (l.type === 'logo') {
    const logo = store?.logo ? resolveImg(store.logo) : null;
    const round = l.frame === 'circle' ? '50%' : l.frame === 'rounded' ? '22%' : '0';
    body = (
      <span
        className="iov-c-logo"
        style={{
          width: `${l.size}cqmin`,
          height: `${l.size}cqmin`,
          borderRadius: round,
          border: l.ring && l.ringW ? `${l.ringW}cqmin solid ${l.ring}` : 'none',
          backgroundColor: logo ? (l.frame === 'none' ? 'transparent' : '#ffffff') : brand,
          backgroundImage: logo ? `url(${JSON.stringify(logo)})` : 'none',
          backgroundSize: l.frame === 'none' ? 'contain' : 'cover',
          color: inkOn(brand),
          fontSize: `${l.size * 0.4}cqmin`,
          filter: shadow,
        }}
      >
        {logo ? null : initialsOf(store?.name)}
      </span>
    );
  } else if (l.type === 'shape') {
    const circle = l.kind === 'circle';
    body = (
      <span
        className="iov-c-shape"
        style={{
          width: l.span === 'x' && !circle ? '100cqw' : `${l.w}cqmin`,
          height: circle ? `${l.w}cqmin` : l.span === 'y' ? '100cqh' : `${l.h}cqmin`,
          background: l.color || 'transparent',
          borderRadius: circle ? '50%' : `${l.radius}cqmin`,
          border: l.border && l.borderW ? `${l.borderW}cqmin solid ${l.border}` : 'none',
          filter: shadow,
        }}
      />
    );
  } else if (l.type === 'image') {
    body = (
      <span
        className="iov-c-image"
        style={{
          width: `${l.w}cqmin`,
          height: `${l.w / (l.ar || 1)}cqmin`,
          borderRadius: `${l.radius}cqmin`,
          backgroundImage: l.url ? `url(${JSON.stringify(resolveImg(l.url) || l.url)})` : 'none',
          filter: shadow,
        }}
      />
    );
  }
  if (!body) return null;
  return (
    <span
      className={`iov-c${selected ? ' is-selected' : ''}`}
      style={style}
      data-layer={l.id}
      onPointerDown={onPointerDown}
    >
      {body}
      {children}
    </span>
  );
}

/** A shop's own design over a photo (inside ImageOverlay's .iov box). */
export default function CustomOverlay({ layers, store }) {
  const list = Array.isArray(layers?.layers) ? layers.layers : Array.isArray(layers) ? layers : [];
  return list.map((l) => <DesignLayer key={l.id} layer={l} store={store} />);
}
