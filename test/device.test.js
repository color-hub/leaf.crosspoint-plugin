// device.json: the request the firmware sends on reader.session, filled the
// way the firmware fills it — raw text, no JSON escaping.
const assert = require('node:assert/strict');
const test = require('node:test');

const {readText, readJson, firmware} = require('./payload');

const device = readJson('device.json');
const manifest = readJson('manifest.json');
const handler = device.events['reader.session'];

const DOC = '0123456789abcdef0123456789abcdef';
const event = {
  id: '3fa9c21b-7', ts: '1734213100', book: '/Books/Dune.epub', document: DOC,
  start_time: '1734212345', end_time: '1734213099', duration_seconds: '754',
  start_progress_bp: '1234', end_progress_bp: '1530', progress_scale: '10000',
};

// PluginEvents.cpp drainSubstituted(): plain replace of every known variable;
// an unknown one stays as literal text.
function fill(template, vars, token = 'tok') {
  let out = template.split('{token}').join(token);
  for (const [key, value] of Object.entries(vars)) out = out.split(`{event.${key}}`).join(value);
  return out;
}

const placeholders = (template) => [...template.matchAll(/\{([a-z_.]+)\}/g)].map((m) => m[1]);

test('only reader.session is subscribed, and it is sent on the sleep connection', () => {
  assert.deepEqual(Object.keys(device.events), ['reader.session']);
  assert.equal(handler.connect, true);
  assert.equal(device.browse, undefined);
});

test('every placeholder is one the firmware fills', () => {
  const known = new Set(['token', ...[...firmware.readerSessionVars, ...firmware.envelopeVars]
      .map((name) => `event.${name}`)]);
  const templates = [handler.request.url, handler.request.body, ...Object.values(handler.request.headers)];
  for (const template of templates) {
    for (const name of placeholders(template)) assert.ok(known.has(name), name);
  }
});

test('the request is a text/plain POST with the bearer token', () => {
  assert.equal(handler.request.method, 'POST');
  assert.equal(handler.request.headers['Content-Type'], 'text/plain');
  assert.equal(handler.request.headers.Authorization, 'Bearer {token}');
});

test('sessions go to readerSync by its run.app address, the one plugin.js pairs with', () => {
  // The reader's TLS fails against cloudfunctions.net.
  assert.match(handler.request.url, /^https:\/\/readersync-\d+\.us-central1\.run\.app\/v1\/sessions$/);
  const server = /const SERVER = '([^']+)'/.exec(readText('plugin.js'))[1];
  assert.equal(handler.request.url, `${server}/v1/sessions`);
});

test('a filled body is the session the server reads', () => {
  const body = JSON.parse(fill(handler.request.body, event));
  assert.deepEqual(body, {
    id: event.id, document: DOC, start: 1734212345, duration: 754, from: 1234, to: 1530,
    book: '/Books/Dune.epub',
  });
});

test('book is the last field, so a path that breaks the JSON leaves the rest intact', () => {
  assert.ok(handler.request.body.endsWith('"book":"{event.book}"}'));
  assert.equal(placeholders(handler.request.body).filter((name) => name === 'event.book').length, 1);

  const path = '/Books/A "quoted" \\ title.epub';
  const filled = fill(handler.request.body, {...event, book: path});
  assert.throws(() => JSON.parse(filled));
  const cut = filled.indexOf('"book":"');
  assert.equal(filled.slice(cut + '"book":"'.length, -2), path);
  const rest = JSON.parse(filled.slice(0, cut) + '"book":""}');
  assert.equal(rest.id, event.id);
  assert.equal(rest.to, 1530);
});

test('the token file is outside the plugin folder and not a credential store', () => {
  const file = device.token.file;
  assert.equal(file, '/.crosspoint/.leaf-token.json');
  assert.equal(device.token.path, 'token');
  // /plugin?file= serves any file inside the plugin folder to the LAN.
  for (const root of firmware.roots) assert.ok(!file.startsWith(`${root}/${manifest.name}/`), root);
  assert.ok(file.startsWith('/') && !file.includes('..'));
  for (const store of firmware.credentialStores) {
    assert.ok(!file.toLowerCase().startsWith(store), store);
  }
});
