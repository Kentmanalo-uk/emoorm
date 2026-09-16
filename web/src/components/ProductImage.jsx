import React, { useState } from 'react';
import useAppSettings, { resolveAppSettingImage } from '../hooks/useAppSettings';
import { resolveImg } from '../lib/media';
import './ProductImage.css';

export default function ProductImage({ src, alt = '', className = '', ...props }) {
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
      onError={() => setFailed(true)}
      {...props}
    />
  );
}
