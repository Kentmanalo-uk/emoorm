import React, { useState } from 'react';
import { resolveImg } from '../lib/media';
import './ProductImage.css';

export default function ProductImage({ src, alt = '', className = '', ...props }) {
  const [failed, setFailed] = useState(false);
  const imageSrc = src ? resolveImg(src) || src : null;

  if (!imageSrc || failed) {
    return (
      <span
        className={`product-image-fallback ${className}`}
        aria-label={alt || 'Product image unavailable'}
        role="img"
        {...props}
      >
        <img src="/brand-icon.png" alt="" aria-hidden="true" />
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
