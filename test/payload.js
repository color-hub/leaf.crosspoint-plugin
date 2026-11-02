// The installable payload and the firmware facts the tests hold it to. The
// firmware facts are copied from CrossPoint's sources (docs/sd-plugins.md,
// docs/plugin-events.md, src/network/ProtectedPaths.h, src/util/PluginEvents.cpp)
// and must be re-checked against every new firmware release.
const fs = require('node:fs');
const path = require('node:path');

const PAYLOAD_DIR = path.join(__dirname, '..', 'leaf.crosspoint-plugin');

const readText = (file) => fs.readFileSync(path.join(PAYLOAD_DIR, file), 'utf8');
const readJson = (file) => JSON.parse(readText(file));

const firmware = {
  // Plugin roots the firmware scans, in priority order.
  roots: ['/.crosspoint/plugins', '/plugins', '/.plugins'],
  // A plugin is subscribed to events only within both limits.
  maxFolderNameBytes: 23,
  maxFolderPathBytes: 63,
  // `{event.*}` variables of reader.session, plus the envelope's own.
  readerSessionVars: [
    'book', 'document', 'start_time', 'end_time', 'duration_seconds',
    'start_progress_bp', 'end_progress_bp', 'progress_scale',
  ],
  envelopeVars: ['id', 'ts'],
  // Files no plugin may read or write (prefix match, case-insensitive).
  credentialStores: ['/.crosspoint/wifi.json', '/.crosspoint/opds.json', '/.crosspoint/koreader.json'],
  maxManifestBytes: 8 * 1024,
  maxTokenFileBytes: 2 * 1024,
  maxReadmeBytes: 16 * 1024,
  // Plugin Hub's tools/build_catalog.py, MAX_DETAILS_SOURCE_BYTES.
  maxDetailsBytes: 16 * 1024,
};

module.exports = {PAYLOAD_DIR, readText, readJson, firmware};
