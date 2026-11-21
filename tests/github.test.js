import assert from 'node:assert/strict';
import test from 'node:test';
import seed from '../cv-data.json' with { type: 'json' };
import {
  commitDocument,
  decodeContent,
  encodeContent,
  verifyToken,
} from '../src/lib/github.js';
import { chooseDocument, cloneData, documentsMatch } from '../src/lib/model.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

test('utf-8 content round-trips through base64', () => {
  const text = 'Myrima Rocío — Bogotá, año 2004 y “MIPRES”\n';
  assert.equal(decodeContent(encodeContent(text)), text);
  assert.equal(decodeContent(`${encodeContent(text).slice(0, 8)}\n${encodeContent(text).slice(8)}`), text);
});

test('a newer repository copy replaces a stale browser copy', () => {
  const local = cloneData(seed);
  local.meta.lastUpdated = '2020-01-01T00:00:00.000Z';
  local.profile.fullName = 'STALE NAME';
  const remote = cloneData(seed);
  remote.meta.lastUpdated = '2026-11-21T00:00:00.000Z';
  remote.profile.fullName = 'FROM GITHUB';
  const choice = chooseDocument(remote, local);
  assert.equal(choice.source, 'repo');
  assert.equal(choice.data.profile.fullName, 'FROM GITHUB');
});

test('equal timestamps keep the repository copy', () => {
  const local = cloneData(seed);
  local.profile.fullName = 'LOCAL';
  const remote = cloneData(seed);
  remote.profile.fullName = 'REPO';
  const choice = chooseDocument(remote, local);
  assert.equal(choice.source, 'repo');
  assert.equal(choice.data.profile.fullName, 'REPO');
});

test('a strictly newer browser copy is kept for publishing', () => {
  const remote = cloneData(seed);
  const local = cloneData(seed);
  local.meta.lastUpdated = '2026-12-01T00:00:00.000Z';
  local.profile.fullName = 'UNPUBLISHED';
  const choice = chooseDocument(remote, local);
  assert.equal(choice.source, 'cache-newer');
  assert.equal(choice.data.profile.fullName, 'UNPUBLISHED');
});

test('documentsMatch ignores lastUpdated only', () => {
  const copy = cloneData(seed);
  copy.meta.lastUpdated = '2030-01-01T00:00:00.000Z';
  assert.equal(documentsMatch(seed, copy), true);
  copy.profile.fullName = 'Other';
  assert.equal(documentsMatch(seed, copy), false);
});

test('commit sends the full document and retries once after a sha conflict', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url, method, body: options.body ? JSON.parse(options.body) : null, auth: options.headers?.Authorization });
    if (method === 'PUT') {
      if (calls.filter((call) => call.method === 'PUT').length === 1) return jsonResponse(409, { message: 'sha mismatch' });
      return jsonResponse(200, { content: { sha: 'blob-after-retry' } });
    }
    return jsonResponse(200, { sha: 'fresh-sha', content: encodeContent(JSON.stringify(seed)) });
  };

  const edited = cloneData(seed);
  edited.profile.fullName = 'MYRIMA ROCIO DUARTE';
  const result = await commitDocument('test-token', edited, 'Update résumé Profile: MYRIMA ROCIO DUARTE', 'stale-sha', fetchImpl);
  assert.equal(result.sha, 'blob-after-retry');
  const puts = calls.filter((call) => call.method === 'PUT');
  assert.equal(puts.length, 2);
  assert.equal(puts[0].body.sha, 'stale-sha');
  assert.equal(puts[1].body.sha, 'fresh-sha');
  assert.equal(puts[1].body.branch, 'main');
  assert.equal(puts[1].body.message, 'Update résumé Profile: MYRIMA ROCIO DUARTE');
  assert.equal(puts[1].auth, 'Bearer test-token');
  const file = JSON.parse(decodeContent(puts[1].body.content));
  assert.equal(file.profile.fullName, 'MYRIMA ROCIO DUARTE');
  assert.equal(file.summary.length, seed.summary.length);
});

test('a second sha conflict is reported and not retried forever', async () => {
  let puts = 0;
  const fetchImpl = async (url, options = {}) => {
    if ((options.method || 'GET') === 'PUT') {
      puts += 1;
      return jsonResponse(409, { message: 'sha mismatch' });
    }
    return jsonResponse(200, { sha: `sha-${puts}`, content: encodeContent(JSON.stringify(seed)) });
  };
  await assert.rejects(
    () => commitDocument('test-token', seed, 'Update résumé', 'old', fetchImpl),
    (error) => error.code === 'conflict' && error.status === 409 && error.detail.includes('sha mismatch') && puts === 2,
  );
});

test('a contents=read token is refused with that detail', async () => {
  const fetchImpl = async () => jsonResponse(200, { permissions: { contents: 'read' } });
  await assert.rejects(
    () => verifyToken('test-token', fetchImpl),
    (error) => error.code === 'noWrite' && error.detail === 'contents=read',
  );
});

test('an owner fine-grained token is accepted from push/admin and a save commits', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ url, method });
    if (url.endsWith('/user')) return jsonResponse(200, { login: 'adminproac' });
    if (url.includes('/contents/')) {
      if (method === 'PUT') {
        return jsonResponse(200, {
          content: { sha: 'blob-new' },
          commit: { sha: 'abc1234', html_url: 'https://github.com/adminproac/Resumens/commit/abc1234' },
        });
      }
      return jsonResponse(200, { sha: 'old-blob', content: encodeContent(JSON.stringify(seed)) });
    }
    return jsonResponse(200, { permissions: { admin: true, maintain: true, push: true, triage: true, pull: true } });
  };

  const { probeConnection, commitDocument: commitFile } = await import('../src/lib/github.js');
  const probe = await probeConnection('github_pat_example', fetchImpl);
  assert.equal(probe.login, 'adminproac');
  assert.equal(probe.access.canWrite, true);
  assert.equal(probe.access.reason, 'repo-role');

  const edited = structuredClone(seed);
  edited.profile.fullName = 'MYRIMA ROCIO DUARTE CACERES';
  const saved = await commitFile('github_pat_example', edited, 'Import résumé JSON', probe.sha, fetchImpl);
  assert.equal(saved.commitUrl, 'https://github.com/adminproac/Resumens/commit/abc1234');
  assert.ok(calls.some((call) => call.method === 'PUT'));
});

test('a write failure keeps the HTTP status and GitHub message', async () => {
  const fetchImpl = async (url, options = {}) => {
    if ((options.method || 'GET') === 'PUT') {
      return jsonResponse(403, { message: 'Resource not accessible by personal access token' });
    }
    return jsonResponse(200, { sha: 'old', content: encodeContent(JSON.stringify(seed)) });
  };
  await assert.rejects(
    () => commitDocument('test-token', seed, 'Import résumé JSON', 'old', fetchImpl),
    (error) => error.status === 403 && error.detail.includes('Resource not accessible by personal access token'),
  );
});

test('unpublished local data is still published when the file matches the screen', async () => {
  const { shouldPublish } = await import('../src/lib/model.js');
  assert.equal(shouldPublish(true, { unsynced: true }), true);
  assert.equal(shouldPublish(true, {}), false);
  assert.equal(shouldPublish(false, {}), true);
});
