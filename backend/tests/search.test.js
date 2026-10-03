const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

const find = async (search, sortBy = 'relevance') => {
  const res = await h.api('GET', `/products?search=${encodeURIComponent(search)}&sortBy=${sortBy}&pageSize=50`);
  assert.equal(res.status, 200, res.body?.message);
  return res.body;
};

test('search finds by Tagalog or English, any word order, plural, and fixes small typos', async () => {
  const store = await h.shop(await h.user('SELLER'));
  const tag = `zx${h.RUN}`;
  await h.product(store, { name: `Red Onion ${tag}` });
  await h.product(store, { name: `Carabao Mangoes ${tag}` });
  await h.product(store, { name: `Kalamunggay Leaves ${tag}` });
  // Only the description mentions onions: found, but ranked after the named one.
  await h.product(store, { name: `Market Bundle ${tag}`, description: 'Bundle with onion, garlic and tomato for the week.' });

  const sibuyas = await find(`${tag} sibuyas`);
  assert.deepEqual(sibuyas.data.map((p) => p.name), [`Red Onion ${tag}`, `Market Bundle ${tag}`]);
  assert.equal((await find(`onion red ${tag}`)).data[0].name, `Red Onion ${tag}`);
  assert.equal((await find(`${tag} mangga`)).data[0].name, `Carabao Mangoes ${tag}`);
  assert.equal((await find(`${tag} mango`)).data[0].name, `Carabao Mangoes ${tag}`);

  const typo = await find(`${tag} kalamungay`);
  assert.equal(typo.data.length, 1);
  assert.match(typo.correctedSearch, /kalamunggay/);

  assert.equal((await find(`${tag} durian`)).data.length, 0);
});
