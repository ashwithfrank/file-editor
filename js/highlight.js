// highlight.js
// A small, dependency-free syntax highlighter. It tokenizes source text
// with one combined regular expression per language and wraps matches in
// <span class="tok-*"> for the CSS in styles.css to color.
//
// This deliberately favors "useful and instant" over full grammar
// accuracy — there's no real parser, just pattern matching. Large files
// (see MAX_HIGHLIGHT_LENGTH) skip highlighting entirely to stay fast.

export const MAX_HIGHLIGHT_LENGTH = 200000; // ~200KB — keeps typing snappy

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const KEYWORDS = {
  JavaScript: 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while yield async await static get set of null true false undefined',
  TypeScript: 'break case catch class const continue debugger default delete do else export extends finally for function if implements import in instanceof interface let new return super switch this throw try type typeof var void while yield async await static get set of null true false undefined enum namespace declare readonly public private protected as',
  Java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch this throw throws transient try void volatile while true false null',
  C: 'auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while',
  'C++': 'auto break case catch char class const continue default delete do double else enum explicit extern false float for friend goto if inline int long mutable namespace new operator private protected public register return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while',
  Python: 'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield',
  Shell: 'if then else elif fi for while do done case esac function in return exit export local readonly',
};

const CURLY_LANGS = new Set(['JavaScript', 'TypeScript', 'Java', 'C', 'C++']);

function buildRules(language) {
  if (CURLY_LANGS.has(language)) {
    return [
      { type: 'comment', re: /\/\/[^\n]*|\/\*[\s\S]*?\*\// },
      { type: 'string', re: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/ },
      { type: 'number', re: /\b0x[\da-fA-F]+\b|\b\d+(?:\.\d+)?\b/ },
      { type: 'keyword', re: new RegExp(`\\b(?:${KEYWORDS[language].split(' ').join('|')})\\b`) },
    ];
  }
  if (language === 'Python' || language === 'Shell') {
    const rules = [
      { type: 'comment', re: /#[^\n]*/ },
      { type: 'string', re: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/ },
      { type: 'number', re: /\b\d+(?:\.\d+)?\b/ },
    ];
    if (KEYWORDS[language]) rules.push({ type: 'keyword', re: new RegExp(`\\b(?:${KEYWORDS[language].split(' ').join('|')})\\b`) });
    return rules;
  }
  if (language === 'YAML') {
    return [
      { type: 'comment', re: /#[^\n]*/ },
      { type: 'key', re: /^[ \t]*[\w.-]+(?=\s*:)/m },
      { type: 'string', re: /"(?:\\.|[^"\\])*"|'(?:[^'])*'/ },
    ];
  }
  if (language === 'HTML' || language === 'XML') {
    return [
      { type: 'comment', re: /<!--[\s\S]*?-->/ },
      { type: 'tag', re: /<\/?[a-zA-Z][\w:-]*/ },
      { type: 'attr', re: /\s[a-zA-Z_-][\w:-]*(?==)/ },
      { type: 'string', re: /"[^"]*"|'[^']*'/ },
      { type: 'punct', re: /\/?>/ },
    ];
  }
  if (language === 'CSS') {
    return [
      { type: 'comment', re: /\/\*[\s\S]*?\*\// },
      { type: 'string', re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/ },
      { type: 'property', re: /[a-zA-Z-]+(?=\s*:)/ },
      { type: 'number', re: /-?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg)?\b/ },
      { type: 'selector', re: /^[ \t]*[.#]?[\w-]+(?=[^{]*\{)/m },
    ];
  }
  if (language === 'JSON') {
    return [
      { type: 'key', re: /"(?:\\.|[^"\\])*"(?=\s*:)/ },
      { type: 'string', re: /"(?:\\.|[^"\\])*"/ },
      { type: 'number', re: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
      { type: 'keyword', re: /\btrue\b|\bfalse\b|\bnull\b/ },
    ];
  }
  if (language === 'Markdown') {
    return [
      { type: 'heading', re: /^#{1,6}[^\n]*/m },
      { type: 'code', re: /```[\s\S]*?```|`[^`\n]+`/ },
      { type: 'bold', re: /\*\*[^*\n]+\*\*/ },
      { type: 'link', re: /\[[^\]]*\]\([^)]*\)/ },
      { type: 'italic', re: /(?<!\*)\*[^*\n]+\*(?!\*)/ },
    ];
  }
  return [];
}

const ruleCache = new Map();

function getBuilt(language) {
  if (ruleCache.has(language)) return ruleCache.get(language);
  const rules = buildRules(language);
  const built = rules.length === 0
    ? null
    : { combined: new RegExp(rules.map((r) => `(${r.re.source})`).join('|'), 'gm'), rules };
  ruleCache.set(language, built);
  return built;
}

/**
 * Returns highlighted HTML for the given source text, or plain escaped
 * text if the language isn't recognized or the file is too large.
 */
export function highlight(text, language) {
  if (text.length > MAX_HIGHLIGHT_LENGTH) return escapeHtml(text);
  const built = getBuilt(language);
  if (!built) return escapeHtml(text);

  const { combined, rules } = built;
  combined.lastIndex = 0;
  let out = '';
  let lastEnd = 0;
  let match;
  while ((match = combined.exec(text)) !== null) {
    if (match[0].length === 0) { combined.lastIndex += 1; continue; }
    let groupIndex = -1;
    for (let i = 1; i < match.length; i += 1) {
      if (match[i] !== undefined) { groupIndex = i - 1; break; }
    }
    out += escapeHtml(text.slice(lastEnd, match.index));
    const type = rules[groupIndex] ? rules[groupIndex].type : 'text';
    out += `<span class="tok-${type}">${escapeHtml(match[0])}</span>`;
    lastEnd = match.index + match[0].length;
  }
  out += escapeHtml(text.slice(lastEnd));
  return out;
}
