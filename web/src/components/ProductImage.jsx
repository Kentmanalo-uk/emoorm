import { useState } from 'react';
import useAppSettings, { resolveAppSettingImage } from '../hooks/useAppSettings';
import { resolveImg, srcSetFor } from '../lib/media';
import './ProductImage.css';

// Product photos load as they come near the screen (lists can hold dozens);
// pass loading="eager" for one that is the page's main picture.
//
// An uploaded photo comes with its smaller copies (srcset), and `sizes` says
// how wide it shows: by default a card in a grid (two across on a phone).
// A small thumbnail passes its own, e.g. sizes="64px". A smaller copy that
// fails to load falls back to the photo itself before the placeholder.
export const CARD_SIZES = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 260px';

export default function ProductImage({
  src, alt = '', className = '', loading = 'lazy', decoding = 'async', sizes = CARD_SIZES, ...props
}) {
  const [failed, setFailed] = useState(false);
  const [plain, setPlain] = useState(false);
  const { settings } = useAppSettings();
  const imageSrc = src ? resolveImg(src) || src : null;
  const srcSet = plain ? undefined : srcSetFor(src);
  const placeholderSrc = resolveAppSettingImage(settings.productPlaceholder);

  if (!imageSrc || failed) {
    return (
      <span
        className={`product-image-fallback ${className}`}
        aria-label={alt || 'Product image unavailable'}
        role="img"
        {...props}
      >
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          onError={(event) => { event.currentTarget.src = '/brand-icon.png'; }}
        />
      </span>
    );
  }

  return (
    <img
      src={imageSrc}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      onError={() => (srcSet ? setPlain(true) : setFailed(true))}
      {...props}
    />
  );
}
