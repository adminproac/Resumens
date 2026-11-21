import { isResumeDocument } from './model.js';

export const GITHUB_OWNER = 'adminproac';
export const GITHUB_REPO = 'Resumens';
export const GITHUB_BRANCH = 'main';
export const GITHUB_PATH = 'cv-data.json';
export const TOKEN_KEY = 'resumens.githubToken';

const API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

export const LOGIN_KEY = 'resumens.githubLogin';
export const COMMIT_KEY = 'resumens.githubCommit';

export class GitHubError extends Error {
  constructor(code, status, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'GitHubError';
    this.code = code;
    this.status = status || 0;
    this.detail = detail || '';
  }
}

export function explainFailure(error) {
  const status = error?.status ? `HTTP ${error.status}` : '';
  const detail = error?.detail || '';
  return [status, detail].filter(Boolean).join(' — ');
}

export function encodeContent(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const size = 0x2000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}

export function decodeContent(value) {
  const clean = String(value || '').replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

export function readToken() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    return token && token.trim() ? token.trim() : '';
  } catch {
    return '';
  }
}

export function writeToken(token) {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LOGIN_KEY);
  } catch {
    /* ignore */
  }
}

export function readLogin() {
  try {
    return localStorage.getItem(LOGIN_KEY) || '';
  } catch {
    return '';
  }
}

export function writeLogin(login) {
  try {
    localStorage.setItem(LOGIN_KEY, login || '');
  } catch {
    /* ignore quota */
  }
}

export function readLastCommit() {
  try {
    const raw = localStorage.getItem(COMMIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || (!parsed.url && !parsed.sha)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastCommit(record) {
  try {
    localStorage.setItem(COMMIT_KEY, JSON.stringify(record));
  } catch {
    /* ignore quota */
  }
}

export function rawDocumentUrl(now = Date.now()) {
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_PATH}?t=${now}`;
}

export function contentsUrl() {
  return `${API}/contents/${GITHUB_PATH}`;
}

function apiHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function statusCode(status) {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 409 || status === 422) return 'conflict';
  return 'network';
}

async function request(url, options, fetchImpl) {
  try {
    return await fetchImpl(url, { cache: 'no-store', ...options });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    throw new GitHubError('network', 0, detail);
  }
}

async function readDetail(response) {
  try {
    const body = await response.json();
    if (typeof body === 'string') return body.slice(0, 400);
    const message = body?.message || '';
    const extra = Array.isArray(body?.errors)
      ? body.errors.map((item) => item?.message || item?.code || '').filter(Boolean).join('; ')
      : '';
    return [message, extra].filter(Boolean).join(' — ').slice(0, 400);
  } catch {
    return '';
  }
}

function fail(response, detail) {
  throw new GitHubError(statusCode(response.status), response.status, detail);
}

/**
 * Fine-grained tokens do not put Contents on GET /repos. That response lists the
 * user's role (push/admin). contents=read is an explicit refusal.
 */
export function interpretPermissions(permissions) {
  const value = permissions && typeof permissions === 'object' ? permissions : {};
  const contents = value.contents;
  if (contents === 'write' || contents === 'admin') {
    return { canWrite: true, reason: 'contents-write', summary: `contents=${contents}` };
  }
  if (contents === 'read') {
    return { canWrite: false, reason: 'contents-read', summary: 'contents=read' };
  }
  if (value.admin === true || value.push === true || value.maintain === true) {
    return {
      canWrite: true,
      reason: 'repo-role',
      summary: `push=${Boolean(value.push)} admin=${Boolean(value.admin)} maintain=${Boolean(value.maintain)}`,
    };
  }
  const listed = Object.entries(value).map(([key, item]) => `${key}=${item}`).join(', ');
  return { canWrite: false, reason: 'no-write', summary: listed || 'permissions empty' };
}

function parseDocument(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GitHubError('invalid');
  }
  if (!isResumeDocument(data)) throw new GitHubError('invalid');
  return data;
}

export async function fetchRawDocument(fetchImpl = fetch) {
  const response = await request(rawDocumentUrl(), { headers: { Accept: 'application/json' } }, fetchImpl);
  if (!response.ok) fail(response, await readDetail(response));
  const data = parseDocument(await response.text());
  return { data, sha: null };
}

export async function fetchContents(token, fetchImpl = fetch) {
  const response = await request(
    `${contentsUrl()}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
    { headers: apiHeaders(token) },
    fetchImpl,
  );
  if (!response.ok) fail(response, await readDetail(response));
  const payload = await response.json();
  const data = parseDocument(decodeContent(payload.content || ''));
  if (!payload.sha) throw new GitHubError('invalid', response.status, 'missing sha');
  return { data, sha: payload.sha };
}

export async function verifyToken(token, fetchImpl = fetch) {
  const response = await request(`${API}`, { headers: apiHeaders(token) }, fetchImpl);
  if (!response.ok) fail(response, await readDetail(response));
  const repo = await response.json();
  const access = interpretPermissions(repo?.permissions);
  if (!access.canWrite) throw new GitHubError('noWrite', response.status, access.summary);
  return access;
}

export async function probeConnection(token, fetchImpl = fetch) {
  const userResponse = await request('https://api.github.com/user', { headers: apiHeaders(token) }, fetchImpl);
  let login = '';
  if (userResponse.ok) {
    const user = await userResponse.json();
    login = user?.login || '';
  } else if (userResponse.status === 401) {
    fail(userResponse, await readDetail(userResponse));
  } else {
    await readDetail(userResponse);
  }

  const repoResponse = await request(`${API}`, { headers: apiHeaders(token) }, fetchImpl);
  if (!repoResponse.ok) fail(repoResponse, await readDetail(repoResponse));
  const repo = await repoResponse.json();
  const access = interpretPermissions(repo?.permissions);
  if (!access.canWrite) throw new GitHubError('noWrite', repoResponse.status, access.summary);

  const file = await fetchContents(token, fetchImpl);
  return { login, access, sha: file.sha, data: file.data };
}

export async function putDocument(token, data, message, expectedSha, fetchImpl = fetch) {
  const response = await request(
    contentsUrl(),
    {
      method: 'PUT',
      headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: encodeContent(`${JSON.stringify(data, null, 2)}\n`),
        sha: expectedSha,
        branch: GITHUB_BRANCH,
      }),
    },
    fetchImpl,
  );
  if (!response.ok) fail(response, await readDetail(response));
  const payload = await response.json();
  const blobSha = payload?.content?.sha;
  if (!blobSha) throw new GitHubError('invalid', response.status, 'missing content sha');
  const commitSha = payload?.commit?.sha || '';
  const commitUrl = payload?.commit?.html_url
    || (commitSha ? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${commitSha}` : '');
  return { sha: blobSha, commitSha, commitUrl };
}

export async function commitDocument(token, data, message, knownSha, fetchImpl = fetch) {
  let sha = knownSha;
  if (!sha) {
    const current = await fetchContents(token, fetchImpl);
    sha = current.sha;
  }
  try {
    return await putDocument(token, data, message, sha, fetchImpl);
  } catch (error) {
    if (!(error instanceof GitHubError) || error.code !== 'conflict') throw error;
    const current = await fetchContents(token, fetchImpl);
    return putDocument(token, data, message, current.sha, fetchImpl);
  }
}
