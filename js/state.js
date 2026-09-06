// state.js
// Central application state: the list of open files, which one is active,
// and user settings. This is a plain object with a tiny pub/sub layer —
// no framework needed for an app this size.

const LANGUAGE_BY_EXT = {
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript',
  html: 'HTML', htm: 'HTML',
  css: 'CSS',
  json: 'JSON',
  py: 'Python',
  md: 'Markdown', markdown: 'Markdown',
  sh: 'Shell', bash: 'Shell',
  yml: 'YAML', yaml: 'YAML',
  xml: 'XML', svg: 'XML',
  java: 'Java',
  c: 'C', h: 'C',
  cpp: 'C++', cc: 'C++', hpp: 'C++', cxx: 'C++',
  txt: 'Plain Text',
};

export function detectLanguage(filename) {
  const dot = filename.lastIndexOf('.');
  const ext = dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
  return LANGUAGE_BY_EXT[ext] || 'Plain Text';
}

let idCounter = 0;
export function nextId() {
  idCounter += 1;
  return `f_${Date.now().toString(36)}_${idCounter}`;
}

const listeners = new Set();

export const state = {
  files: [],      // { id, name, language, content, originalContent, dirty, handle }
  activeId: null,
  settings: {
    theme: 'auto',
    fontSize: 14,
    wordWrap: false,
    tabSize: 2,
    lineNumbers: true,
  },
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(event) {
  for (const fn of listeners) fn(event);
}

export function getActiveFile() {
  return state.files.find((f) => f.id === state.activeId) || null;
}

export function addFile(file) {
  state.files.push(file);
  state.activeId = file.id;
  notify({ type: 'files-changed' });
  notify({ type: 'active-changed' });
}

export function closeFile(id) {
  const idx = state.files.findIndex((f) => f.id === id);
  if (idx === -1) return;
  state.files.splice(idx, 1);
  if (state.activeId === id) {
    const next = state.files[idx] || state.files[idx - 1] || null;
    state.activeId = next ? next.id : null;
    notify({ type: 'active-changed' });
  }
  notify({ type: 'files-changed' });
}

export function setActive(id) {
  if (state.activeId === id) return;
  state.activeId = id;
  notify({ type: 'active-changed' });
}

export function updateActiveContent(content) {
  const file = getActiveFile();
  if (!file) return;
  file.content = content;
  const wasDirty = file.dirty;
  file.dirty = content !== file.originalContent;
  notify({ type: 'content-changed', file });
  if (wasDirty !== file.dirty) notify({ type: 'files-changed' });
}

export function renameActive(name) {
  const file = getActiveFile();
  if (!file) return;
  file.name = name;
  file.language = detectLanguage(name);
  notify({ type: 'files-changed' });
  notify({ type: 'active-changed' });
}

export function markSaved(file) {
  file.originalContent = file.content;
  file.dirty = false;
  notify({ type: 'files-changed' });
}

export function hasUnsaved() {
  return state.files.some((f) => f.dirty);
}

const SETTINGS_KEY = 'file-editor:settings';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(state.settings, JSON.parse(raw));
  } catch (err) {
    // Corrupt or inaccessible storage (private browsing, quota) — ignore and use defaults.
  }
}

export function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (err) {
    // Storage may be unavailable — settings simply won't persist this session.
  }
}
