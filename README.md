# File Editor

A small, fast, browser-based file editor for developers. No install, no
build step, no server — open `index.html` (or visit the GitHub Pages
site) and start editing. Files never leave your machine.

## Features

- **Multiple open files** with a file explorer sidebar and a tab strip
- **Native file access** — uses the File System Access API in supporting
  browsers, so Save writes straight back to the file you opened; falls
  back to a plain file picker + download everywhere else
- **Syntax highlighting** for JavaScript/TypeScript, HTML, CSS, JSON,
  Python, Markdown, YAML, Java, C/C++, and Shell (lightweight, regex-based
  — no external library)
- **Line numbers**, active-line-aware gutter, adjustable font size
- **Find and replace**, with match counting and replace-all
- **Go to line**
- **Auto-indent** and Tab/Shift+Tab block indent, with configurable tab size
- **Word wrap** toggle
- **Three themes** — dark, light, and a high-contrast mode — with
  automatic OS theme detection and a manual override, both remembered
- **Unsaved-changes protection** — a confirm dialog before closing a
  dirty tab, and a browser warning before closing the page
- **Responsive** — collapsible sidebar becomes an overlay drawer on
  narrow screens; usable down to phone width
- **Accessible** — semantic HTML, labeled controls, visible focus states,
  keyboard shortcuts

## Using it

Open the page and either open a local file or create a new one from the
empty state or the toolbar. Multiple files stay open as tabs; click a
tab or a sidebar entry to switch between them. Use **Save** to write
back to disk (or download, in browsers without file-write support) and
**Download** to always export a copy.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl`/`Cmd` + `S` | Save |
| `Ctrl`/`Cmd` + `Z` | Undo |
| `Ctrl`/`Cmd` + `Shift` + `Z` | Redo |
| `Ctrl`/`Cmd` + `F` | Find |
| `Ctrl`/`Cmd` + `H` | Find and replace |
| `Ctrl`/`Cmd` + `G` | Go to line |
| `Ctrl`/`Cmd` + `A` | Select all |
| `Tab` / `Shift` + `Tab` | Indent / outdent |
| `Esc` | Close find bar or dialog |

Undo, redo, and select-all use the browser's native textarea behavior,
so they also work exactly as expected with the OS's own shortcuts.

## Supported browsers

Works in current Chrome, Edge, Firefox, and Safari. The File System
Access API (direct save-to-disk) is currently Chromium-only; other
browsers automatically fall back to opening via a file picker and
saving via download, with the original filename and extension preserved.

## Project structure

```
index.html      Markup: layout, toolbar, modals, empty state
styles.css      All styling — theme tokens, layout, components
js/
  state.js      File list, active file, settings — plain state + pub/sub
  highlight.js  Lightweight regex-based syntax highlighter
  editor.js     The editing surface: gutter, scroll sync, keybindings, find/replace
  ui.js         Toolbar, sidebar, tabs, modals, toasts, theming, file I/O
  main.js       Bootstraps the app
```

Plain HTML, CSS, and JavaScript — no build step, no framework, no
dependencies. `js/*.js` are loaded as native ES modules, which every
supported browser handles directly.

## Technologies used

Vanilla HTML5, CSS3 (custom properties for theming), and JavaScript
(ES modules). Inline SVG for icons. No third-party libraries or fonts.

## Deploying to GitHub Pages

Nothing special is required — this is a fully static site. Enable
GitHub Pages for the repository (Settings → Pages → Deploy from branch)
pointing at the root of the `main` branch, and the app will be served
as-is.

## Limitations

- Syntax highlighting is pattern-based, not a real parser — it covers
  common cases well but isn't always perfect (e.g. highlighting inside
  deeply nested template literals).
- Very large files (roughly 200KB+) skip syntax highlighting to keep
  typing responsive; the file still opens and edits normally.
- Saving directly back to disk requires a browser with the File System
  Access API; other browsers save via download instead.
- Open files and their contents are not persisted between page reloads
  — only your settings (theme, font size, etc.) are remembered.

## Possible future improvements

- Persist the open-file session (not just settings) across reloads
- Drag-and-drop file opening, and a real resizable sidebar
- Minimap or code folding for longer files
- A command palette for quicker access to actions
