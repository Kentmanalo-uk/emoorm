// Quick check that app files compile (Babel with Expo's preset), without a
// full Metro bundle. Pass files, or nothing to check every changed/new .js
// file under mobile/ (git status). Imports are not resolved; run
// `npx expo export` for that.
//   node tools/check-syntax.cjs [file ...]
const { execSync } = require('child_process');
const path = require('path');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');
// A file git lists as deleted has nothing to check.
const l_deleted = (out, f) => out.split('\n').some((l) => /^( D|D )/.test(l) && l.endsWith(f));
let files = process.argv.slice(2);
if (files.length === 0) {
  const out = execSync('git status --porcelain --untracked-files=all -- .', { cwd: root, encoding: 'utf8' });
  files = out.split('\n')
    .map((l) => l.slice(3).trim().replace(/^.* -> /, '').replace(/^"|"$/g, ''))
    .filter((f) => /\.jsx?$/.test(f) && !l_deleted(out, f))
    .map((f) => path.join(root, '..', f));
}
let failed = 0;
for (const file of files) {
  try {
    babel.transformFileSync(path.resolve(file), {
      cwd: root,
      babelrc: false,
      configFile: false,
      presets: [require.resolve('babel-preset-expo')],
      filename: file,
    });
  } catch (err) {
    failed += 1;
    console.log(`✗ ${file}\n  ${String(err.message).split('\n').slice(0, 3).join('\n  ')}`);
  }
}
console.log(failed ? `${failed} of ${files.length} file(s) failed` : `ok: ${files.length} file(s)`);
process.exit(failed ? 1 : 0);
