import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const staticRoot = new URL('../app/static/', import.meta.url);

test('mobile call page exposes a user-gesture audio arm before a ring event', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('mobile.html', staticRoot), 'utf8'),
    readFile(new URL('mobile.js', staticRoot), 'utf8'),
  ]);

  assert.match(html, /id="audioArm"/);
  assert.match(html, /id="armAudio"/);
  assert.match(script, /audioArmed/);
  assert.match(script, /unlockAudio/);
});
