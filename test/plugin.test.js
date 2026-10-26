// plugin.js: the Leaf card on the reader's Settings page, run in jsdom against
// a fake reader — its SD card, its relay and its status endpoint.
const assert = require('node:assert/strict');
const test = require('node:test');
const {JSDOM} = require('jsdom');

const {readText, firmware} = require('./payload');

const SOURCE = readText('plugin.js');
const DIR = '/plugins/leaf';
const TOKEN_FILE = '/.crosspoint/.leaf-token.json';
const SERVER = 'https://readersync-485315818927.us-central1.run.app';

const decode = (b64) => Buffer.from(b64, 'base64').toString('utf8');

// Loads plugin.js the way PluginHost.js does and hands it a container and an
// api. `relay` answers the pairing request; `status` is /api/status's body.
async function mount({relay, status = {deviceId: 'dev-1'}, files = {}} = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="card"></div></body>', {runScripts: 'outside-only'});
  const {window} = dom;
  const sd = new Map(Object.entries(files));
  const writes = [];
  const relays = [];

  window.fetch = async (url) => {
    const query = new URL(url, 'http://reader.local');
    if (query.pathname === '/plugin') {
      const content = sd.get(`${DIR}/${query.searchParams.get('file')}`);
      return content == null ?
        {ok: false, status: 404, json: async () => ({})} :
        {ok: true, status: 200, json: async () => JSON.parse(content)};
    }
    if (query.pathname === '/api/status') {
      assert.equal(query.searchParams.get('plugin'), 'leaf');
      if (status instanceof Error) throw status;
      return {ok: true, status: 200, json: async () => status};
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  let registered;
  window.CrossPoint = {registerPlugin: (fn) => { registered = fn; }};
  window.eval(SOURCE);
  assert.equal(typeof registered, 'function');

  const api = {
    name: 'leaf',
    dir: DIR,
    pluginFile: (file) => `/plugin?name=leaf&file=${encodeURIComponent(file)}`,
    relay: async (method, url, headers, body) => {
      // The page's objects come from another realm; copy them into this one.
      relays.push({method, url, headers: JSON.parse(JSON.stringify(headers)), body: JSON.parse(body)});
      return relay(relays.at(-1));
    },
    writeFile: async (path, b64) => {
      // /api/plugin-fs refuses an empty body and a credential store.
      assert.ok(b64.length > 0, 'empty write');
      for (const store of firmware.credentialStores) assert.ok(!path.toLowerCase().startsWith(store));
      writes.push({path, text: decode(b64)});
      sd.set(path, decode(b64));
    },
  };
  const container = window.document.getElementById('card');
  await registered(container, api);

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  async function submit(code) {
    container.querySelector('input').value = code;
    container.querySelector('form').dispatchEvent(new window.Event('submit', {cancelable: true}));
    for (let i = 0; i < 10; i++) await settle();
  }
  async function click() {
    container.querySelector('button').dispatchEvent(new window.Event('click'));
    for (let i = 0; i < 10; i++) await settle();
  }
  const text = () => container.textContent;
  return {container, sd, writes, relays, submit, click, text};
}

const ok = (token) => () => ({status: 200, headers: [], body: JSON.stringify({token})});

test('an unpaired reader shows the code form', async () => {
  const card = await mount();
  assert.equal(card.container.querySelector('h2').textContent, 'Leaf');
  assert.ok(card.container.querySelector('form input'));
  assert.match(card.text(), /Settings → E-reader → Connect a reader/);
  assert.equal(card.container.querySelector('button').textContent, 'Connect');
});

test('a code trades for a token kept outside the plugin folder', async () => {
  const card = await mount({relay: ok('secret-token')});
  await card.submit('  ABCD2345 ');

  assert.deepEqual(card.relays, [{
    method: 'POST', url: `${SERVER}/v1/pair`, headers: {'Content-Type': 'application/json'},
    body: {code: 'ABCD2345', deviceId: 'dev-1'},
  }]);
  assert.deepEqual(JSON.parse(card.sd.get(TOKEN_FILE)), {token: 'secret-token'});
  assert.ok(!card.writes.some((w) => w.text.includes('secret-token') && w.path.startsWith(DIR)));
  assert.ok(Date.parse(JSON.parse(card.sd.get(`${DIR}/paired.json`)).pairedAt) > 0);
  assert.match(card.text(), /^LeafConnected .+Your reading sessions go to Leaf/);
  assert.equal(card.container.querySelector('button').textContent, 'Disconnect');
});

test('without a device id the pairing still goes as "reader"', async () => {
  const card = await mount({relay: ok('t'), status: new Error('offline')});
  await card.submit('ABCD2345');
  assert.equal(card.relays[0].body.deviceId, 'reader');

  const bare = await mount({relay: ok('t'), status: {}});
  await bare.submit('ABCD2345');
  assert.equal(bare.relays[0].body.deviceId, 'reader');
});

test('an empty code sends nothing', async () => {
  const card = await mount({relay: ok('t')});
  await card.submit('   ');
  assert.equal(card.relays.length, 0);
  assert.equal(card.writes.length, 0);
});

for (const [status, message] of [
  [404, 'This code is unknown. Check it and try again.'],
  [410, 'This code has expired. Get a new one in Leaf.'],
  [500, 'Leaf did not answer (500). Try again later.'],
]) {
  test(`a ${status} answer explains itself and writes nothing`, async () => {
    const card = await mount({relay: () => ({status, headers: [], body: '{}'})});
    await card.submit('ABCD2345');
    assert.equal(card.container.querySelector('p:last-child').textContent, message);
    assert.equal(card.writes.length, 0);
    assert.ok(card.container.querySelector('form'));
  });
}

test('a relay failure reads as no connection', async () => {
  const card = await mount({relay: () => { throw new Error('relay failed'); }});
  await card.submit('ABCD2345');
  assert.match(card.text(), /No connection to Leaf\. Check the reader’s Wi-Fi/);
  assert.equal(card.writes.length, 0);
});

test('a paired reader shows when it was connected', async () => {
  const card = await mount({files: {[`${DIR}/paired.json`]: '{"pairedAt":"2026-10-20T10:00:00.000Z"}'}});
  assert.match(card.text(), /Connected .+\. Your reading sessions go to Leaf when the reader connects/);
});

test('disconnect overwrites the token with an object carrying none', async () => {
  const card = await mount({files: {
    [`${DIR}/paired.json`]: '{"pairedAt":"2026-10-20T10:00:00.000Z"}',
    [TOKEN_FILE]: '{"token":"secret-token"}',
  }});
  await card.click();
  assert.deepEqual(JSON.parse(card.sd.get(TOKEN_FILE)), {});
  assert.deepEqual(JSON.parse(card.sd.get(`${DIR}/paired.json`)), {});
  assert.ok(card.container.querySelector('form'));
});
