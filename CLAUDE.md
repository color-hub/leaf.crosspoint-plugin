# CLAUDE.md

The Leaf plugin for the CrossPoint e-reader firmware. Its server half (`readerSync`, `parseSessionBody`) and the Leaf app live in the private `color-hub/trackers` monorepo (`functions/reader/`, `leaf/lib/features/reader_sync/`). `README.md` (English) is the public install guide; `leaf.crosspoint-plugin/README.md` is the plain text the reader shows.

- **This repository is public**: never commit a secret, a token, a user's file or anything from the monorepo beyond the plugin.
- `leaf.crosspoint-plugin/` is installed on the SD card as is: nothing in it is generated, and its stem `leaf` is the plugin's folder name on the device (≤ 23 bytes).
- **`manifest.json`'s `files` lists every file of the payload** — Plugin Hub installs only what it names; every runtime change bumps `version`, and a release is the tag `v<version>` (the `release` workflow publishes it; never a pre-release, Plugin Hub skips those).
- **A released version stays on readers forever**: `device.json`'s request body is a contract with the server, which parses every released shape — change it only together with the monorepo's `parseSessionBody` and its pinned template in `functions/test/reader.test.js`.
- **The firmware substitutes `{event.*}` raw, without JSON escaping**: `book` stays the LAST field of the body and the request goes as `text/plain`, so the server can salvage a path that broke the JSON.
- **The token lives in `/.crosspoint/.leaf-token.json`, outside the plugin folder** — `/plugin?file=` serves any file inside it to the LAN.
- **The plugin calls `readerSync` by its run.app address, never `cloudfunctions.net`** — the reader's TLS fails against the latter; the URL is written in both `device.json` and `plugin.js`.
- `test/payload.js` holds the firmware facts the tests rely on; re-check them against each CrossPoint release. `npm test` runs everything; logic in `plugin.js` lands with its test in `test/plugin.test.js`.
- Commit messages: English, conventional-commit subject (`type(scope): summary`), straight to `main`.
