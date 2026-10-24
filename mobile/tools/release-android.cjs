// Builds, signs and publishes the Android app (shop.emoorm.app).
//
//   node tools/release-android.cjs 2.1.0 12          bump + build + sign + publish
//   node tools/release-android.cjs 2.1.0 12 --no-build   sign + publish an existing build
//
// 1. Sets the version in app.json and android/app/build.gradle.
// 2. gradlew assembleRelease against https://emoorm.shop/api (arm only, so
//    the APK stays under GitHub's 100 MB file limit).
// 3. Signs with the release key in ../apk/keystore (read only; its password
//    is read from keystore.properties and never printed) and verifies it.
// 4. Copies it to ../apk-react-native/ and web/public/downloads/, removes the
//    old download, and rewrites web/src/data/androidApp.json (size, hashes,
//    date). The What's New notes are kept as they are; edit them by hand.
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
const unsigned = path.join(MOBILE, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
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
    '-p', path.join(MOBILE, 'android'), 'assembleRelease',
    '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a',
  ], { cwd: path.join(MOBILE, 'android'), env, stdio: 'inherit', shell: true });
}
if (!fs.existsSync(unsigned)) throw new Error(`no build at ${unsigned}`);

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
