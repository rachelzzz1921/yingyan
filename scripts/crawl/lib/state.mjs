import fs from 'fs';
import { STATE_PATH } from '../config.mjs';

const DEFAULT = {
  version: 1,
  seen_urls: {},
  seen_attachments: {},
  runs: [],
};

export function loadState() {
  try {
    return { ...DEFAULT, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveState(state) {
  fs.mkdirSync(STATE_PATH.replace(/[^/]+$/, ''), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

export function hasSeenUrl(state, url) {
  return !!state.seen_urls[url];
}

export function markSeenUrl(state, url, meta = {}) {
  state.seen_urls[url] = { at: new Date().toISOString(), ...meta };
}

export function hasSeenAttachment(state, hash) {
  return !!state.seen_attachments[hash];
}

export function markSeenAttachment(state, hash, meta = {}) {
  state.seen_attachments[hash] = { at: new Date().toISOString(), ...meta };
}

export function recordRun(state, summary) {
  state.runs.push({ at: new Date().toISOString(), ...summary });
  if (state.runs.length > 50) state.runs = state.runs.slice(-50);
}
