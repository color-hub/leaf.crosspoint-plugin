// manifest.json against the Plugin Hub publishing contract and the firmware's
// plugin loader.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {PAYLOAD_DIR, readText, readJson, firmware} = require('./payload');

const manifest = readJson('manifest.json');
const stem = path.basename(PAYLOAD_DIR).replace(/\.crosspoint-plugin$/, '');

test('the repository has exactly one payload folder', () => {
  const root = path.join(PAYLOAD_DIR, '..');
  const payloads = fs.readdirSync(root).filter((name) => name.endsWith('.crosspoint-plugin'));
  assert.deepEqual(payloads, [path.basename(PAYLOAD_DIR)]);
});

test('name is the payload stem and a safe plugin id', () => {
  assert.equal(manifest.name, stem);
  assert.match(manifest.name, /^[a-z0-9-]+$/);
});

test('the installed folder name fits the event subscription limits in every root', () => {
  assert.ok(Buffer.byteLength(manifest.name) <= firmware.maxFolderNameBytes);
  for (const root of firmware.roots) {
    assert.ok(Buffer.byteLength(`${root}/${manifest.name}`) <= firmware.maxFolderPathBytes, root);
  }
});

test('version is MAJOR.MINOR.PATCH', () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test('files lists every file of the payload and nothing else', () => {
  const onDisk = fs.readdirSync(PAYLOAD_DIR).sort();
  assert.deepEqual([...manifest.files].sort(), onDisk);
  assert.ok(manifest.files.includes('manifest.json'));
  assert.ok(manifest.files.includes('device.json'));
  assert.ok(manifest.files.includes('plugin.js'));
});

test('the card mounts on the Settings page', () => {
  assert.equal(manifest.mount, 'settings');
  assert.equal(manifest.title, 'Leaf');
  assert.ok(manifest.description.length > 0);
});

test('the manifests and the README fit the firmware caps', () => {
  assert.ok(Buffer.byteLength(readText('manifest.json')) <= firmware.maxManifestBytes);
  assert.ok(Buffer.byteLength(readText('device.json')) <= firmware.maxManifestBytes);
  assert.ok(Buffer.byteLength(readText('README.md')) <= firmware.maxReadmeBytes);
});

test('device.json shows the same title and description as the manifest', () => {
  const device = readJson('device.json');
  assert.equal(device.title, manifest.title);
  assert.equal(device.description, manifest.description);
});
