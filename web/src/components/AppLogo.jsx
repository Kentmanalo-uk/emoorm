import React from 'react';
import useAppSettings, { resolveAppSettingImage } from '../hooks/useAppSettings';

export default function AppLogo({ alt = 'Emoorm', onError, ...props }) {
  const { settings } = useAppSettings();
  const logoSrc = resolveAppSettingImage(settings.appLogo);

  const handleError = (event) => {
    if (!event.currentTarget.src.endsWith('/brand-icon.png')) {
      event.currentTarget.src = '/brand-icon.png';
    }
    onError?.(event);
  };

  return <img src={logoSrc} alt={alt} onError={handleError} {...props} />;
}