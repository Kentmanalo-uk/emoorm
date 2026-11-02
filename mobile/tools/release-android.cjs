// Builds, signs and publishes the Android app (shop.emoorm.app).
//
//   node tools/release-android.cjs 2.1.0 12          bump + build + sign + publish
//   node tools/release-android.cjs 2.1.0 12 --no-build   sign + publish an existing build
//   node tools/release-android.cjs 2.2.1 17 --aab    bump + build an .aab for Play
//
// 1. Sets the version in app.json and android/app/build.gradle.
// 2. gradlew assembleRelease against https://emoorm.shop/api (arm only, so
//    the APK stays under GitHub's 100 MB file limit).
// 3. Signs with the release key in ../apk/keystore (read only; its password
//    is read from keystore.properties and never printed) and verifies it.
// 4. Copies it to ../apk-react-native/ and web/public/downloads/, removes the
//    old download, and rewrites web/src/data/androidApp.json (size, hashes,
//    date). The What's New notes are kept as they are; edit them by hand.
//
// --aab builds the Play upload instead, on this machine rather than on
// Expo's servers, and stops after step 3. It differs in three ways:
//
//  - gradlew bundleRelease, not assembleRelease.
//  - Gradle signs it itself, through signingConfigs.release in
//    app/build.gradle, with the same key. zipalign and apksigner are not
//    used and could not be: both are APK tools, and an .aab is a signed
//    jar. keytool reads the certificate back out of it instead.
//  - Nothing is published. An .aab cannot be installed from a web page;
//    Play opens it and builds each phone its own APK. The site's download
//    and androidApp.json stay on the APK, so they are left alone.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MOBILE = path.join(ROOT, 'mobile');
const [version, codeArg, ...flags] = process.argv.slice(2);
const versionCode = Number(codeArg);
if (!/^\d+\.\d+\.\d+$/.test(version || '') || !Number.isInteger(versionCode)) {
  console.error('usage: node tools/release-android.cjs <x.y.z> <versionCode> [--no-build]');
  process.exit(1);
}
const AAB = flags.includes('--aab');
const SDK = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
const JAVA_HOME = process.env.JAVA_HOME_17 || 'C:/Users/Kaye/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2';
const BUILD_TOOLS = path.join(SDK, 'build-tools', '36.0.0');

const editFile = (file, fn) => {
  const s = fs.readFileSync(file, 'utf8');
  const out = fn(s);
  if (out === s) return false;
  fs.writeFileSync(file, out);
  return true;
};

// 1. Version.
editFile(path.join(MOBILE, 'app.json'), (s) => s
  .replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${version}$2`)
  .replace(/("versionCode":\s*)\d+/, `$1${versionCode}`));
editFile(path.join(MOBILE, 'android', 'app', 'build.gradle'), (s) => s
  .replace(/versionCode \d+/, `versionCode ${versionCode}`)
  .replace(/versionName "[^"]*"/, `versionName "${version}"`));
console.log(`version ${version} (${versionCode})`);

// 2. Build.
const unsigned = AAB
  ? path.join(MOBILE, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
  : path.join(MOBILE, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!flags.includes('--no-build')) {
  const env = {
    ...process.env,
    JAVA_HOME,
    ANDROID_HOME: SDK,
    EXPO_PUBLIC_API_BASE_URL: 'https://emoorm.shop/api',
    NODE_ENV: 'production',
  };
  env.PATH = `${path.join(JAVA_HOME, 'bin')};${env.PATH}`;
  console.log('building… (several minutes)');
  execFileSync(path.join(MOBILE, 'android', 'gradlew.bat'), [
    '-p', path.join(MOBILE, 'android'), AAB ? 'bundleRelease' : 'assembleRelease',
    // The .aab carries all four architectures: Play splits it per device,
    // so a phone downloads only its own, and without x86/x86_64 every
    // Chromebook and Intel tablet is left out of the supported devices.
    // The APK stays arm only to stay under GitHub's 100 MB file limit;
    // --x86 adds x86_64 to it for testing on an emulator.
    `-PreactNativeArchitectures=${AAB ? 'armeabi-v7a,arm64-v8a,x86,x86_64' : `armeabi-v7a,arm64-v8a${flags.includes('--x86') ? ',x86_64' : ''}`}`,
  ], { cwd: path.join(MOBILE, 'android'), env, stdio: 'inherit', shell: true });
}
if (!fs.existsSync(unsigned)) throw new Error(`no build at ${unsigned}`);

// 3. An .aab is already signed, by Gradle, with the same key: all that
// is left is to put it where the APKs go and read the certificate back
// out of it to prove which key that was.
if (AAB) {
  const outDir = path.join(ROOT, 'apk-react-native');
  fs.mkdirSync(outDir, { recursive: true });
  // Named with the versionCode as well, because Play refuses a second
  // upload of the same one and that is the number to check.
  const bundle = path.join(outDir, `E-MOORM-${version}-${versionCode}.aab`);
  fs.copyFileSync(unsigned, bundle);

  const keytool = path.join(JAVA_HOME, 'bin', 'keytool.exe');
  const printed = execFileSync(keytool, ['-printcert', '-jarfile', bundle], { encoding: 'utf8' });
  const sha256 = (printed.match(/SHA256:\s*([0-9A-F:]+)/i) || [])[1];
  if (!sha256) throw new Error('the bundle is not signed: check apk/keystore/keystore.properties');

  const published = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'src', 'data', 'androidApp.json'), 'utf8'));
  if (published.certificateSha256 && published.certificateSha256 !== sha256) {
    throw new Error(`signed with a different key than the published app:\n  bundle    ${sha256}\n  published ${published.certificateSha256}`);
  }

  const size = fs.statSync(bundle).size;
  console.log(`\n${path.relative(ROOT, bundle)} (${(size / 1048576).toFixed(1)} MB)`);
  console.log(`  signed with ${sha256.slice(0, 11)}… — the same key as the published app`);
  console.log('  upload it to Play Console; nothing on the site changed (an .aab cannot be side-loaded)');
  process.exit(0);
}

// 3. Sign + verify (apksigner needs Java too).
const javaEnv = { ...process.env, JAVA_HOME, PATH: `${path.join(JAVA_HOME, 'bin')};${process.env.PATH}` };
const keyDir = path.join(ROOT, 'apk', 'keystore');
const props = Object.fromEntries(fs.readFileSync(path.join(keyDir, 'keystore.properties'), 'utf8')
  .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const store = path.isAbsolute(props.storeFile) ? props.storeFile : path.join(keyDir, props.storeFile);
const outDir = path.join(ROOT, 'apk-react-native');
fs.mkdirSync(outDir, { recursive: true });
const signed = path.join(outDir, `E-MOORM-${version}.apk`);
const aligned = path.join(outDir, `E-MOORM-${version}-aligned.apk`);
execFileSync(path.join(BUILD_TOOLS, 'zipalign.exe'), ['-f', '-p', '4', unsigned, aligned], { stdio: 'inherit' });
execFileSync(path.join(BUILD_TOOLS, 'apksigner.bat'), [
  'sign', '--ks', store, '--ks-key-alias', props.keyAlias,
  '--ks-pass', 'env:EMOORM_KS_PASS', '--key-pass', 'env:EMOORM_KEY_PASS',
  '--out', signed, aligned,
], { stdio: 'inherit', shell: true, env: { ...javaEnv, EMOORM_KS_PASS: props.storePassword, EMOORM_KEY_PASS: props.keyPassword || props.storePassword } });
fs.rmSync(aligned, { force: true });
fs.rmSync(`${signed}.idsig`, { force: true });
const verify = execFileSync(path.join(BUILD_TOOLS, 'apksigner.bat'), ['verify', '--print-certs', signed], { shell: true, env: javaEnv }).toString();
const cert = (verify.match(/certificate SHA-256 digest: ([0-9a-f]+)/i) || [])[1];
if (!cert) throw new Error('apksigner verify failed');
const certColon = cert.toUpperCase().match(/../g).join(':');

// --test: a build to try on a phone or emulator, not handed out.
if (flags.includes('--test')) {
  console.log(`test build ${path.relative(ROOT, signed)} (not published)`);
  process.exit(0);
}

// 4. Publish to the site.
const dataFile = path.join(ROOT, 'web', 'src', 'data', 'androidApp.json');
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
if (data.certificateSha256 && data.certificateSha256 !== certColon) {
  throw new Error('signed with a different key than the published app: refusing to publish');
}
const downloads = path.join(ROOT, 'web', 'public', 'downloads');
const target = path.join(downloads, `E-MOORM-${version}.apk`);
fs.copyFileSync(signed, target);
const oldFile = data.file && path.join(ROOT, 'web', 'public', data.file);
if (oldFile && path.resolve(oldFile) !== path.resolve(target)) fs.rmSync(oldFile, { force: true });
const buf = fs.readFileSync(target);
Object.assign(data, {
  version,
  versionCode,
  file: `/downloads/E-MOORM-${version}.apk`,
  size: buf.length,
  sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  certificateSha256: certColon,
  released: new Date().toISOString().slice(0, 10),
});
fs.writeFileSync(dataFile, `${JSON.stringify(data, null, 2)}\n`);
console.log(`published ${data.file} (${(buf.length / 1048576).toFixed(1)} MB), cert ${certColon.slice(0, 11)}…`);
