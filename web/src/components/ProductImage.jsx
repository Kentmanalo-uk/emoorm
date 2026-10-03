import { useState } from 'react';
import useAppSettings, { resolveAppSettingImage } from '../hooks/useAppSettings';
import { resolveImg } from '../lib/media';
import './ProductImage.css';

// Product photos load as they come near the screen (lists can hold dozens);
// pass loading="eager" for one that is the page's main picture.
export default function ProductImage({
  src, alt = '', className = '', loading = 'lazy', decoding = 'async', ...props
}) {
  const [failed, setFailed] = useState(false);
  const { settings } = useAppSettings();
  const imageSrc = src ? resolveImg(src) || src : null;
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
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      onError={() => setFailed(true)}
      {...props}
    />
  );
}
