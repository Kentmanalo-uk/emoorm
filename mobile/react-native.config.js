// react-native-maps draws the iPhone maps on Apple Maps (the *.ios.js map
// components). Android keeps the Leaflet / tile maps, so the library is not
// linked into the Android app (no Google Maps key needed, a smaller APK).
//
// Expo's autolinking merges this over the library's own config, and a merge
// drops `android: null`; pointing Android at a folder that does not exist
// makes it skip the library instead (no Gradle project there, nothing linked).
module.exports = {
  dependencies: {
    'react-native-maps': {
      platforms: {
        android: { sourceDir: 'android-not-linked' },
      },
    },
  },
};
