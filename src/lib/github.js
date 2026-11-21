import { isResumeDocument } from './model.js';

export const GITHUB_OWNER = 'adminproac';
export const GITHUB_REPO = 'Resumens';
export const GITHUB_BRANCH = 'main';
export const GITHUB_PATH = 'cv-data.json';
export const TOKEN_KEY = 'resumens.githubToken';

const API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

export class GitHubError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'GitHubError';
    this.code = code;
    this.status = status || 0;
  }
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
  } catch {
    /* ignore */
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
  } catch {
    throw new GitHubError('network');
  }
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
  if (!response.ok) throw new GitHubError(statusCode(response.status), response.status);
  const data = parseDocument(await response.text());
  return { data, sha: null };
}

export async function fetchContents(token, fetchImpl = fetch) {
  const response = await request(
    `${contentsUrl()}?ref=${encodeURIComponent(GITHUB_BRANCH)}`,
    { headers: apiHeaders(token) },
    fetchImpl,
  );
  if (!response.ok) throw new GitHubError(statusCode(response.status), response.status);
  const payload = await response.json();
  const data = parseDocument(decodeContent(payload.content || ''));
  if (!payload.sha) throw new GitHubError('invalid');
  return { data, sha: payload.sha };
}

export async function verifyToken(token, fetchImpl = fetch) {
  const response = await request(`${API}`, { headers: apiHeaders(token) }, fetchImpl);
  if (!response.ok) throw new GitHubError(statusCode(response.status), response.status);
  const repo = await response.json();
  const contents = repo?.permissions?.contents;
  if (contents !== 'write' && contents !== 'admin') throw new GitHubError('noWrite', response.status);
  return true;
}

export async function putDocument(token, data, message, sha, fetchImpl = fetch) {
  const response = await request(
    contentsUrl(),
    {
      method: 'PUT',
      headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: encodeContent(`${JSON.stringify(data, null, 2)}\n`),
        sha,
        branch: GITHUB_BRANCH,
      }),
    },
    fetchImpl,
  );
  if (response.status === 409 || response.status === 422) throw new GitHubError('conflict', response.status);
  if (!response.ok) throw new GitHubError(statusCode(response.status), response.status);
  const payload = await response.json();
  const nextSha = payload?.content?.sha;
  if (!nextSha) throw new GitHubError('invalid');
  return nextSha;
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
