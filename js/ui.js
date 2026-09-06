// ui.js
// Wires up everything that isn't the text-editing surface itself: the
// toolbar, sidebar, tab strip, status bar, modals, toasts, theming, and
// file I/O (including the modern File System Access API where available,
// with a plain <input type="file"> + download fallback everywhere else).

import {
  state, subscribe, getActiveFile, addFile, closeFile, setActive,
  renameActive, markSaved, hasUnsaved, nextId, detectLanguage,
  loadSettings, saveSettings,
} from './state.js';
import {
  renderContent, setCursorChangeHandler, focusEditor, applyFontSize,
  applyTabSize, getEditorValue, goToLine, find, findNext, findPrev,
  replaceCurrent, replaceAll, clearFindState,
} from './editor.js';

const supportsFSAccess = typeof window.showOpenFilePicker === 'function';

// ---------- DOM references ----------
const $ = (id) => document.getElementById(id);
const appEl = $('app');
const fileListEl = $('file-list');
const tabStripEl = $('tab-strip');
const emptyStateEl = $('empty-state');
const editorContainerEl = $('editor-container');
const fileInputEl = $('file-input');

const statusFilename = $('status-filename');
const statusFiletype = $('status-filetype');
const statusCursor = $('status-cursor');
const statusCounts = $('status-counts');
const statusDirty = $('status-dirty');

const btnSave = $('btn-save');
const btnDownload = $('btn-download');
const btnFind = $('btn-find');
const btnGoto = $('btn-goto');

// ---------- Toasts ----------
function toast(message, variant) {
  const el = document.createElement('div');
  el.className = `toast${variant ? ` toast-${variant}` : ''}`;
  el.textContent = message;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------- Modal handling ----------
const overlay = $('modal-overlay');
let activeModal = null;
let modalResolve = null;

function openModal(id) {
  activeModal = $(id);
  overlay.hidden = false;
  activeModal.hidden = false;
  const firstField = activeModal.querySelector('input, select, button.btn-primary');
  if (firstField) firstField.focus();
}

function closeModal(result) {
  if (!activeModal) return;
  activeModal.hidden = true;
  overlay.hidden = true;
  activeModal = null;
  if (modalResolve) { modalResolve(result); modalResolve = null; }
}

overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(null); });
document.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', () => closeModal(null)));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeModal) closeModal(null);
});

// ---------- Confirm-unsaved-changes flow ----------
function confirmDiscard(file) {
  $('confirm-message').textContent = `"${file.name}" has unsaved changes. What would you like to do?`;
  return new Promise((resolve) => {
    const cleanup = () => {
      $('confirm-discard').removeEventListener('click', onDiscard);
      $('confirm-save').removeEventListener('click', onSave);
    };
    const onDiscard = () => closeModal('discard');
    const onSave = () => closeModal('save');
    $('confirm-discard').addEventListener('click', onDiscard);
    $('confirm-save').addEventListener('click', onSave);
    // Runs exactly once no matter how the dialog closes (Discard, Save,
    // Cancel, backdrop click, or Escape) — always detaches the listeners.
    modalResolve = (result) => { cleanup(); resolve(result); };
    openModal('confirm-modal');
  });
}

// ---------- Rendering: sidebar + tabs ----------
function iconClose() {
  return '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
}

function renderLists() {
  fileListEl.innerHTML = '';
  tabStripEl.innerHTML = '';

  state.files.forEach((file) => {
    const isActive = file.id === state.activeId;

    const li = document.createElement('li');
    li.className = `file-item${isActive ? ' active' : ''}${file.dirty ? ' dirty' : ''}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(isActive));
    li.innerHTML = `
      <span class="file-dot"></span>
      <span class="file-name">${escapeHtml(file.name)}</span>
      <button class="file-close" aria-label="Close ${escapeHtml(file.name)}">${iconClose()}</button>
    `;
    li.addEventListener('click', (e) => { if (!e.target.closest('.file-close')) selectFile(file.id); });
    li.querySelector('.file-close').addEventListener('click', (e) => { e.stopPropagation(); requestClose(file.id); });
    fileListEl.appendChild(li);

    const tab = document.createElement('div');
    tab.className = `tab${isActive ? ' active' : ''}${file.dirty ? ' dirty' : ''}`;
    tab.setAttribute('role', 'tab');
    tab.innerHTML = `
      <span class="tab-dot"></span>
      <span class="tab-name">${escapeHtml(file.name)}</span>
      <button class="tab-close" aria-label="Close ${escapeHtml(file.name)}">${iconClose()}</button>
    `;
    tab.addEventListener('click', (e) => { if (!e.target.closest('.tab-close')) selectFile(file.id); });
    tab.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); requestClose(file.id); });
    tabStripEl.appendChild(tab);
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function selectFile(id) {
  setActive(id);
}

async function requestClose(id) {
  const file = state.files.find((f) => f.id === id);
  if (!file) return;
  if (file.dirty) {
    const choice = await confirmDiscard(file);
    if (!choice) return; // cancelled (Escape, backdrop, or Cancel button)
    if (choice === 'save') { await saveFile(file); }
  }
  closeFile(id);
}

// ---------- Empty state / editor visibility ----------
function renderActive() {
  const file = getActiveFile();
  if (!file) {
    emptyStateEl.hidden = false;
    editorContainerEl.hidden = true;
    statusFilename.textContent = 'No file open';
    statusFiletype.textContent = '';
    statusCursor.textContent = '';
    statusCounts.textContent = '';
    statusDirty.textContent = '';
    [btnSave, btnDownload, btnFind, btnGoto].forEach((b) => { b.disabled = true; });
    document.title = 'File Editor';
    return;
  }
  emptyStateEl.hidden = true;
  editorContainerEl.hidden = false;
  renderContent(file);
  updateStatusBar(file);
  [btnSave, btnDownload, btnFind, btnGoto].forEach((b) => { b.disabled = false; });
  document.title = `${file.dirty ? '\u25CF ' : ''}${file.name} — File Editor`;
  focusEditor();
}

function updateStatusBar(file) {
  statusFilename.textContent = file.name;
  statusFiletype.textContent = file.language;
  statusDirty.textContent = file.dirty ? 'Unsaved changes' : 'Saved';
  updateCounts(file.content);
}

function updateCounts(content) {
  const chars = content.length;
  const words = content.trim() === '' ? 0 : content.trim().split(/\s+/).length;
  statusCounts.textContent = `${chars} char${chars === 1 ? '' : 's'} · ${words} word${words === 1 ? '' : 's'}`;
}

setCursorChangeHandler(({ line, col }) => {
  statusCursor.textContent = `Ln ${line}, Col ${col}`;
  updateCounts(getEditorValue());
  const file = getActiveFile();
  if (file) statusDirty.textContent = file.dirty ? 'Unsaved changes' : 'Saved';
});

subscribe((event) => {
  if (event.type === 'files-changed') {
    renderLists();
    const file = getActiveFile();
    if (file) {
      updateStatusBar(file);
      document.title = `${file.dirty ? '\u25CF ' : ''}${file.name} — File Editor`;
    }
  }
  if (event.type === 'active-changed') {
    renderLists();
    renderActive();
    clearFindState();
    closeFindBar();
  }
});

// ---------- File creation ----------
let untitledCounter = 0;

async function createNewFile() {
  untitledCounter += 1;
  const defaultName = `untitled-${untitledCounter}.txt`;
  $('newfile-name').value = defaultName;
  const name = await new Promise((resolve) => {
    const onConfirm = () => {
      const value = $('newfile-name').value.trim() || defaultName;
      closeModal(value);
    };
    $('newfile-confirm').addEventListener('click', onConfirm);
    modalResolve = (result) => {
      $('newfile-confirm').removeEventListener('click', onConfirm);
      resolve(result);
    };
    openModal('newfile-modal');
  });
  if (!name) return;
  const file = {
    id: nextId(), name, language: detectLanguage(name),
    content: '', originalContent: '', dirty: false, handle: null,
  };
  addFile(file);
  toast(`Created ${name}`);
}
$('newfile-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('newfile-confirm').click(); });

// ---------- Opening files ----------
async function openFiles() {
  if (supportsFSAccess) {
    try {
      const handles = await window.showOpenFilePicker({ multiple: true });
      for (const handle of handles) {
        const blob = await handle.getFile();
        const content = await blob.text();
        addOpenedFile(blob.name, content, handle);
      }
    } catch (err) {
      if (err.name !== 'AbortError') toast('Could not open file', 'error');
    }
    return;
  }
  fileInputEl.click();
}

fileInputEl.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    const content = await f.text();
    addOpenedFile(f.name, content, null);
  }
  fileInputEl.value = '';
});

function addOpenedFile(name, content, handle) {
  const file = {
    id: nextId(), name, language: detectLanguage(name),
    content, originalContent: content, dirty: false, handle,
  };
  addFile(file);
  toast(`Opened ${name}`);
}

// ---------- Saving / downloading ----------
function downloadBlob(file) {
  const blob = new Blob([file.content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function saveFile(file) {
  if (!file) return;
  if (file.handle) {
    try {
      const writable = await file.handle.createWritable();
      await writable.write(file.content);
      await writable.close();
      markSaved(file);
      toast(`Saved ${file.name}`, 'success');
      return;
    } catch (err) {
      toast(`Could not save ${file.name} directly — trying again`, 'error');
    }
  }
  if (supportsFSAccess) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: file.name });
      const writable = await handle.createWritable();
      await writable.write(file.content);
      await writable.close();
      file.handle = handle;
      const blob = await handle.getFile();
      file.name = blob.name;
      renameActive(file.name);
      markSaved(file);
      toast(`Saved ${file.name}`, 'success');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  downloadBlob(file);
  markSaved(file);
  toast(`Downloaded ${file.name}`, 'success');
}

function downloadFile(file) {
  if (!file) return;
  downloadBlob(file);
  toast(`Downloaded ${file.name}`, 'success');
}

// ---------- Toolbar wiring ----------
$('btn-new').addEventListener('click', createNewFile);
$('empty-new').addEventListener('click', createNewFile);
$('btn-sidebar-new').addEventListener('click', createNewFile);
$('btn-open').addEventListener('click', openFiles);
$('empty-open').addEventListener('click', openFiles);
$('btn-sidebar-open').addEventListener('click', openFiles);
$('btn-save').addEventListener('click', () => saveFile(getActiveFile()));
$('btn-download').addEventListener('click', () => downloadFile(getActiveFile()));
$('btn-goto').addEventListener('click', async () => {
  $('goto-line').value = '';
  const value = await new Promise((resolve) => {
    const onConfirm = () => {
      const n = parseInt($('goto-line').value, 10);
      closeModal(Number.isFinite(n) ? n : null);
    };
    $('goto-confirm').addEventListener('click', onConfirm);
    modalResolve = (result) => {
      $('goto-confirm').removeEventListener('click', onConfirm);
      resolve(result);
    };
    openModal('goto-modal');
  });
  if (value) goToLine(value);
});
$('goto-line').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('goto-confirm').click(); });

// ---------- Sidebar collapse (also mobile drawer) ----------
function isMobile() { return window.matchMedia('(max-width: 860px)').matches; }

$('btn-sidebar-toggle').addEventListener('click', () => {
  appEl.classList.toggle('sidebar-collapsed');
  const pressed = !appEl.classList.contains('sidebar-collapsed');
  $('btn-sidebar-toggle').setAttribute('aria-pressed', String(pressed));
});
$('sidebar-scrim').addEventListener('click', () => appEl.classList.add('sidebar-collapsed'));
if (isMobile()) {
  appEl.classList.add('sidebar-collapsed');
  $('btn-sidebar-toggle').setAttribute('aria-pressed', 'false');
}

// ---------- Find / replace bar ----------
const findBar = $('find-bar');
const findInput = $('find-input');
const replaceInput = $('replace-input');
const findCount = $('find-count');
const replaceRow = $('replace-row');

function openFindBar(withReplace) {
  if (!getActiveFile()) return;
  findBar.hidden = false;
  replaceRow.hidden = !withReplace;
  findInput.focus();
  findInput.select();
  runFind();
}
function closeFindBar() {
  findBar.hidden = true;
  clearFindState();
}
$('find-close').addEventListener('click', closeFindBar);
$('find-toggle-replace').addEventListener('click', () => { replaceRow.hidden = !replaceRow.hidden; if (!replaceRow.hidden) replaceInput.focus(); });

function runFind() {
  const { count, index } = find(findInput.value);
  findCount.textContent = count ? `${index + 1}/${count}` : '0/0';
}
findInput.addEventListener('input', runFind);
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); goFind(e.shiftKey ? -1 : 1); }
  if (e.key === 'Escape') closeFindBar();
});
$('find-next').addEventListener('click', () => goFind(1));
$('find-prev').addEventListener('click', () => goFind(-1));
function goFind(dir) {
  const { count, index } = dir > 0 ? findNext(findInput.value) : findPrev(findInput.value);
  findCount.textContent = count ? `${index + 1}/${count}` : '0/0';
}
$('replace-one').addEventListener('click', () => { replaceCurrent(findInput.value, replaceInput.value); runFind(); });
$('replace-all').addEventListener('click', () => {
  const n = replaceAll(findInput.value, replaceInput.value);
  toast(`Replaced ${n} occurrence${n === 1 ? '' : 's'}`);
  runFind();
});

// ---------- Settings modal ----------
$('btn-settings').addEventListener('click', () => {
  $('setting-theme').value = state.settings.theme;
  $('setting-font-size').value = state.settings.fontSize;
  $('setting-font-size-value').textContent = `${state.settings.fontSize}px`;
  $('setting-tab-size').value = String(state.settings.tabSize);
  $('setting-word-wrap').checked = state.settings.wordWrap;
  $('setting-line-numbers').checked = state.settings.lineNumbers;
  openModal('settings-modal');
});
$('setting-theme').addEventListener('change', (e) => { state.settings.theme = e.target.value; applyTheme(); saveSettings(); });
$('setting-font-size').addEventListener('input', (e) => {
  state.settings.fontSize = Number(e.target.value);
  $('setting-font-size-value').textContent = `${state.settings.fontSize}px`;
  applyFontSize(state.settings.fontSize);
  saveSettings();
});
$('setting-tab-size').addEventListener('change', (e) => { state.settings.tabSize = Number(e.target.value); applyTabSize(state.settings.tabSize); saveSettings(); });
$('setting-word-wrap').addEventListener('change', (e) => {
  state.settings.wordWrap = e.target.checked;
  appEl.classList.toggle('word-wrap', state.settings.wordWrap);
  saveSettings();
});
$('setting-line-numbers').addEventListener('change', (e) => {
  state.settings.lineNumbers = e.target.checked;
  appEl.classList.toggle('no-line-numbers', !state.settings.lineNumbers);
  const file = getActiveFile();
  if (file) renderContent(file);
  saveSettings();
});

// ---------- Help modal ----------
$('btn-help').addEventListener('click', () => openModal('help-modal'));

// ---------- Theming ----------
const mediaDark = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  let theme = state.settings.theme;
  if (theme === 'auto') theme = mediaDark.matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
}
mediaDark.addEventListener('change', () => { if (state.settings.theme === 'auto') applyTheme(); });

// ---------- Global keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === 's') { e.preventDefault(); saveFile(getActiveFile()); }
  else if (key === 'f') { e.preventDefault(); openFindBar(false); }
  else if (key === 'h') { e.preventDefault(); openFindBar(true); }
  else if (key === 'g') { e.preventDefault(); $('btn-goto').click(); }
  // Ctrl/Cmd+A, Z, Shift+Z, and browser Save are intentionally left alone —
  // native textarea behavior (select all / undo / redo) already handles them.
});

// ---------- Warn before losing unsaved work ----------
window.addEventListener('beforeunload', (e) => {
  if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Init ----------
export function initUI() {
  loadSettings();
  applyTheme();
  applyFontSize(state.settings.fontSize);
  applyTabSize(state.settings.tabSize);
  appEl.classList.toggle('word-wrap', state.settings.wordWrap);
  appEl.classList.toggle('no-line-numbers', !state.settings.lineNumbers);
  renderLists();
  renderActive();
}
