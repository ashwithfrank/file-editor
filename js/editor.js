// editor.js
// Drives the actual text-editing surface: the textarea, its line-number
// gutter, and the syntax-highlight overlay layer behind it. Using a real
// <textarea> (instead of contenteditable) means native undo/redo, native
// selection, and mobile keyboard support all come for free.

import { highlight } from './highlight.js';
import { state, getActiveFile, updateActiveContent } from './state.js';

const editorEl = document.getElementById('editor');
const gutterEl = document.getElementById('gutter');
const highlightCodeEl = document.getElementById('highlight-code');
const scrollEl = document.getElementById('editor-scroll');

let onCursorChange = () => {};
export function setCursorChangeHandler(fn) { onCursorChange = fn; }

/** Renders the given content into the textarea + highlight layer + gutter. */
export function renderContent(file) {
  editorEl.value = file.content;
  highlightCodeEl.innerHTML = highlight(file.content, file.language);
  renderGutter(file.content);
  syncScroll();
}

function countLines(text) {
  let lines = 1;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) lines += 1;
  return lines;
}

function renderGutter(text) {
  if (!state.settings.lineNumbers) { gutterEl.textContent = ''; return; }
  const total = countLines(text);
  const parts = new Array(total);
  for (let i = 1; i <= total; i += 1) parts[i - 1] = i;
  gutterEl.textContent = parts.join('\n');
}

function syncScroll() {
  const layer = document.getElementById('highlight-layer');
  layer.style.transform = `translate(${-scrollEl.scrollLeft}px, ${-scrollEl.scrollTop}px)`;
  gutterEl.scrollTop = scrollEl.scrollTop;
}
scrollEl.addEventListener('scroll', syncScroll);

/** Re-renders just the highlight layer + gutter after a content edit (cheap). */
function refreshHighlight() {
  const file = getActiveFile();
  if (!file) return;
  highlightCodeEl.innerHTML = highlight(file.content, file.language);
  renderGutter(file.content);
}

editorEl.addEventListener('input', () => {
  const file = getActiveFile();
  if (!file) return;
  updateActiveContent(editorEl.value);
  refreshHighlight();
  reportCursor();
});

function reportCursor() {
  const value = editorEl.value;
  const pos = editorEl.selectionStart;
  let line = 1;
  let col = 1;
  for (let i = 0; i < pos; i += 1) {
    if (value.charCodeAt(i) === 10) { line += 1; col = 1; } else { col += 1; }
  }
  onCursorChange({ line, col, length: value.length });
}
editorEl.addEventListener('keyup', reportCursor);
editorEl.addEventListener('click', reportCursor);
editorEl.addEventListener('select', reportCursor);
editorEl.addEventListener('scroll', syncScroll);

// ---------- Tab / auto-indent handling ----------
editorEl.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    handleTab(e.shiftKey);
    return;
  }
  if (e.key === 'Enter') {
    // Let the browser insert the newline natively (keeps native undo
    // grouping intact), then fix up indentation on the new line.
    handleAutoIndentOnEnter();
  }
});

function currentTabString() {
  return ' '.repeat(state.settings.tabSize);
}

function handleTab(outdent) {
  const { value, selectionStart, selectionEnd } = editorEl;
  const tab = currentTabString();

  if (selectionStart === selectionEnd && !outdent) {
    insertAtCursor(tab);
    return;
  }

  // Multi-line indent/outdent: operate on whole lines touching the selection.
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  let lineEnd = value.indexOf('\n', selectionEnd - 1);
  if (lineEnd === -1) lineEnd = value.length;

  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  let firstLineDelta = 0;
  let totalDelta = 0;

  const outdentRe = new RegExp(`^(?:\\t| {1,${state.settings.tabSize}})`);
  const updated = lines.map((line, i) => {
    if (outdent) {
      const match = line.match(outdentRe);
      if (match) {
        if (i === 0) firstLineDelta = -match[0].length;
        totalDelta -= match[0].length;
        return line.slice(match[0].length);
      }
      return line;
    }
    if (i === 0) firstLineDelta = tab.length;
    totalDelta += tab.length;
    return tab + line;
  }).join('\n');

  editorEl.setRangeText(updated, lineStart, lineEnd, 'select');
  editorEl.selectionStart = Math.max(lineStart, selectionStart + firstLineDelta);
  editorEl.selectionEnd = selectionEnd + totalDelta;
  updateActiveContent(editorEl.value);
  refreshHighlight();
  reportCursor();
}

function handleAutoIndentOnEnter() {
  // Runs after the newline character has already been inserted by the browser.
  requestAnimationFrame(() => {
    const { value, selectionStart } = editorEl;
    const beforeCursor = value.slice(0, selectionStart);
    const lastNewline = beforeCursor.lastIndexOf('\n');
    const prevLineStart = beforeCursor.lastIndexOf('\n', lastNewline - 1) + 1;
    const prevLine = beforeCursor.slice(prevLineStart, lastNewline);
    const indentMatch = prevLine.match(/^[ \t]*/);
    let indent = indentMatch ? indentMatch[0] : '';
    if (/[{([:]\s*$/.test(prevLine)) indent += currentTabString();
    if (indent) {
      insertAtCursor(indent);
    }
  });
}

function insertAtCursor(text) {
  const start = editorEl.selectionStart;
  const end = editorEl.selectionEnd;
  editorEl.setRangeText(text, start, end, 'end');
  updateActiveContent(editorEl.value);
  refreshHighlight();
  reportCursor();
}

export function focusEditor() {
  editorEl.focus();
}

export function applyFontSize(px) {
  document.documentElement.style.setProperty('--editor-font-size', `${px}px`);
}

export function applyTabSize(size) {
  document.documentElement.style.setProperty('--tab-size', String(size));
}

export function getEditorValue() {
  return editorEl.value;
}

export function goToLine(lineNumber) {
  const value = editorEl.value;
  const lines = value.split('\n');
  const target = Math.max(1, Math.min(lineNumber, lines.length));
  let pos = 0;
  for (let i = 0; i < target - 1; i += 1) pos += lines[i].length + 1;
  editorEl.focus();
  editorEl.selectionStart = pos;
  editorEl.selectionEnd = pos + lines[target - 1].length;
  const lineHeight = parseFloat(getComputedStyle(editorEl).lineHeight) || 20;
  scrollEl.scrollTop = Math.max(0, lineHeight * (target - 3));
  reportCursor();
}

// ---------- Find / replace ----------
// A textarea has no native find, so matches are tracked by index and
// "jumping" to one just moves the native selection there.
let matches = [];
let matchIndex = -1;

export function find(query, { caseSensitive = false } = {}) {
  matches = [];
  matchIndex = -1;
  if (!query) return { count: 0, index: -1 };
  const value = editorEl.value;
  const haystack = caseSensitive ? value : value.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    matches.push(idx);
    from = idx + Math.max(needle.length, 1);
  }
  if (matches.length) {
    // Prefer the match nearest the current cursor.
    const cursor = editorEl.selectionStart;
    matchIndex = matches.findIndex((m) => m >= cursor);
    if (matchIndex === -1) matchIndex = 0;
    selectMatch(query.length);
  }
  return { count: matches.length, index: matchIndex };
}

function selectMatch(len) {
  if (matchIndex < 0 || matchIndex >= matches.length) return;
  const start = matches[matchIndex];
  editorEl.focus();
  editorEl.selectionStart = start;
  editorEl.selectionEnd = start + len;
  const lineHeight = parseFloat(getComputedStyle(editorEl).lineHeight) || 20;
  const line = editorEl.value.slice(0, start).split('\n').length;
  scrollEl.scrollTop = Math.max(0, lineHeight * (line - 4));
}

export function findNext(query, opts) {
  if (!matches.length) return find(query, opts);
  matchIndex = (matchIndex + 1) % matches.length;
  selectMatch(query.length);
  return { count: matches.length, index: matchIndex };
}

export function findPrev(query, opts) {
  if (!matches.length) return find(query, opts);
  matchIndex = (matchIndex - 1 + matches.length) % matches.length;
  selectMatch(query.length);
  return { count: matches.length, index: matchIndex };
}

export function replaceCurrent(query, replacement, opts) {
  if (matchIndex < 0 || !matches.length) { find(query, opts); return; }
  const start = matches[matchIndex];
  editorEl.setRangeText(replacement, start, start + query.length, 'end');
  updateActiveContent(editorEl.value);
  refreshHighlight();
  find(query, opts);
}

export function replaceAll(query, replacement, opts) {
  if (!query) return 0;
  const { caseSensitive = false } = opts || {};
  const value = editorEl.value;
  const flags = caseSensitive ? 'g' : 'gi';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, flags);
  const count = (value.match(re) || []).length;
  editorEl.value = value.replace(re, replacement);
  updateActiveContent(editorEl.value);
  refreshHighlight();
  matches = [];
  matchIndex = -1;
  return count;
}

export function clearFindState() {
  matches = [];
  matchIndex = -1;
}
