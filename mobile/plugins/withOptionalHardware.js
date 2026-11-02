const { withAndroidManifest, withGradleProperties } = require('expo/config-plugins');

/*
 * Hardware the app can use but must not require.
 *
 * Google Play reads the permissions an app asks for and, unless told
 * otherwise, treats the hardware behind them as required: CAMERA means a
 * camera WITH autofocus, RECORD_AUDIO a microphone, and every app needs a
 * touchscreen. Phones with a fixed-focus camera, tablets, Chromebooks and
 * TV boxes then cannot see the app at all (2.3.0: about 12,000 supported
 * devices against 19,000 for the old web-view app, which declared these).
 *
 * Every feature that uses them already checks for them at run time (QR scan,
 * image search, maps), so none of it is required.
 */
const OPTIONAL = [
  'android.hardware.camera',
  'android.hardware.camera.any',
  'android.hardware.camera.autofocus',
  'android.hardware.camera.front',
  'android.hardware.camera.flash',
  'android.hardware.microphone',
  'android.hardware.location',
  'android.hardware.location.gps',
  'android.hardware.location.network',
  'android.hardware.touchscreen',
  'android.hardware.telephony',
  'android.hardware.wifi',
];

/*
 * Native libraries unpacked when the app is installed (useLegacyPackaging).
 * Left inside the APK, React Native looks for them only under the device's
 * first architecture, so an Intel Chromebook or tablet running the arm-only
 * APK through translation found no libreactnative.so and closed at once.
 */
const withExtractedLibs = (config) => withGradleProperties(config, (cfg) => {
  const props = cfg.modResults;
  const existing = props.find((p) => p.type === 'property' && p.key === 'expo.useLegacyPackaging');
  if (existing) existing.value = 'true';
  else props.push({ type: 'property', key: 'expo.useLegacyPackaging', value: 'true' });
  return cfg;
});

module.exports = function withOptionalHardware(config) {
  return withAndroidManifest(withExtractedLibs(config), (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = manifest['uses-feature'] || [];
    for (const name of OPTIONAL) {
      const existing = features.find((f) => f.$?.['android:name'] === name);
      if (existing) existing.$['android:required'] = 'false';
      else features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    manifest['uses-feature'] = features;
    return cfg;
  });
};
