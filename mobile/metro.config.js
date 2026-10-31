// https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ikions (@ikions/react, the website's icons) makes every icon with one
// factory that draws DOM <svg>. Here its icon modules get the app's own
// factory instead (src/lib/ikionNative.js), which draws the same icon data
// with react-native-svg.
const IKION_FACTORY = path.join(__dirname, 'src/lib/ikionNative.js');
const IKION_ICON_DIR = /[\\/]@ikions[\\/]react[\\/]dist[\\/]icons[\\/]/;
const upstream = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '../create-ikion.js' && IKION_ICON_DIR.test(context.originModulePath)) {
    return { type: 'sourceFile', filePath: IKION_FACTORY };
  }
  return (upstream || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
