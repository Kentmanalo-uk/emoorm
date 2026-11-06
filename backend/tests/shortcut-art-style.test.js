// How the shortcut marks are drawn (Home's shortcuts, the seller's tools):
// GLASS, the look they had before there was a choice, or POP (glossy 3D).
// A super admin picks it; everyone reads it from /app-settings.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const appSettingService = require('../src/services/appSetting.service');

// Every test here changes a global setting, so it is put back afterwards.
after(async () => {
  await appSettingService.update({ shortcutArtStyle: 'GLASS', shortcutIconScale: 100 }).catch(() => {});
  await h.cleanup();
});

const current = async () => (await h.api('GET', '/app-settings')).body?.data?.shortcutArtStyle;

test('glass unless a super admin chooses 3D', async () => {
  await appSettingService.update({ shortcutArtStyle: 'GLASS' });
  assert.equal(await current(), 'GLASS');

  const admin = await h.user('SUPER_ADMIN');
  const changed = await h.api('PUT', '/app-settings', {
    token: h.token(admin),
    body: { shortcutArtStyle: 'pop' },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body?.data?.shortcutArtStyle, 'POP', 'stored in capitals, whatever was sent');
});

test('only a super admin may change it, and only to a look that exists', async () => {
  await appSettingService.update({ shortcutArtStyle: 'GLASS' });

  for (const role of ['SELLER', 'MUNICIPAL_ADMIN']) {
    const someone = await h.user(role);
    const res = await h.api('PUT', '/app-settings', {
      token: h.token(someone),
      body: { shortcutArtStyle: 'POP' },
    });
    assert.equal(res.status, 403, `a ${role} cannot set the look for everyone`);
  }

  const admin = await h.user('SUPER_ADMIN');
  for (const bad of ['NEON', '', null, 3]) {
    const res = await h.api('PUT', '/app-settings', { token: h.token(admin), body: { shortcutArtStyle: bad } });
    assert.equal(res.status, 400, `${JSON.stringify(bad)} is refused`);
  }
  const saved = await appSettingService.get();
  assert.equal(saved.shortcutArtStyle, 'GLASS', 'nothing bad got through');
});

test('their size: standard unless chosen, and only from the sizes offered', async () => {
  await appSettingService.update({ shortcutIconScale: 100 });
  assert.equal((await h.api('GET', '/app-settings')).body?.data?.shortcutIconScale, 100);

  const admin = await h.user('SUPER_ADMIN');
  const put = (value, who = admin) => h.api('PUT', '/app-settings', { token: h.token(who), body: { shortcutIconScale: value } });

  const larger = await put(130);
  assert.equal(larger.status, 200);
  assert.equal(larger.body?.data?.shortcutIconScale, 130);

  const seller = await h.user('SELLER');
  assert.equal((await put(85, seller)).status, 403, 'a seller cannot resize them for everyone');

  for (const bad of [0, 50, 101, 200, '', null, 'large']) {
    assert.equal((await put(bad)).status, 400, `${JSON.stringify(bad)} is refused`);
  }
  assert.equal((await appSettingService.get()).shortcutIconScale, 130, 'nothing bad got through');
});
