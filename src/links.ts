// Optional post-processing for model output: wrap substrings that match an
// existing note title or alias in [[wiki links]]. Kept Obsidian-free so the
// matching logic stays self-contained; the host (main.ts) gathers the candidate
// list from the vault and hands it over.

export interface LinkCandidate {
  // The surface string to look for in the text (a note basename or an alias).
  name: string;
  // The note basename the match should link to (the [[target]]).
  path: string;
}

export interface Linkifier {
  // Returns `text` with the first occurrence of each known name wrapped in a
  // wiki link. `excludePath` (the current file) is never linked to itself.
  linkify(text: string, excludePath?: string): string;
}

// Spans that must never be linkified: existing wiki/markdown links and images,
// inline code, and bare URLs. We match these first and only scan the gaps.
const PROTECTED_RE =
  /\[\[[^\]]*\]\]|!?\[[^\]]*\]\([^)]*\)|`[^`]*`|https?:\/\/\S+/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createLinkifier(candidates: LinkCandidate[]): Linkifier {
  // Lowercased surface -> target basename. First writer wins, so de-dupe here.
  const byLower = new Map<string, string>();
  for (const c of candidates) {
    const name = c.name.trim();
    // Skip single characters: a 1-char title would link almost everywhere.
    if (name.length < 2) continue;
    const key = name.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, c.path);
  }
  if (byLower.size === 0) return { linkify: (text) => text };

  // Longest names first so the alternation prefers the longest match at any
  // position (JS alternation is first-match, not longest-match).
  const names = [...byLower.keys()].sort((a, b) => b.length - a.length);

  // ASCII word-boundary guards stop "AI" from matching inside "rain" while still
  // allowing CJK matches — Japanese has no spaces, so a Unicode-letter boundary
  // would block every in-sentence match. The unavoidable cost is that a CJK
  // candidate can match inside a longer CJK token (e.g. a note "日本" linking
  // inside "日本語"); there is no boundary that both allows "日本" + particle and
  // rejects "日本" + "語", so we accept the occasional over-match here.
  const matchRe = new RegExp(
    "(?<![A-Za-z0-9_])(" + names.map(escapeRegExp).join("|") + ")(?![A-Za-z0-9_])",
    "gi"
  );

  const linkifyFree = (
    segment: string,
    used: Set<string>,
    excludePath?: string
  ): string =>
    segment.replace(matchRe, (m) => {
      const target = byLower.get(m.toLowerCase());
      if (target == null) return m;
      if (excludePath && target === excludePath) return m;
      // First occurrence per note only.
      if (used.has(target)) return m;
      used.add(target);
      // Preserve the original surface text; only add an alias pipe when the
      // case (or alias) differs from the target basename.
      return m === target ? `[[${m}]]` : `[[${target}|${m}]]`;
    });

  return {
    linkify(text, excludePath) {
      const used = new Set<string>();
      let out = "";
      let last = 0;
      PROTECTED_RE.lastIndex = 0;
      let pm: RegExpExecArray | null;
      while ((pm = PROTECTED_RE.exec(text)) !== null) {
        out += linkifyFree(text.slice(last, pm.index), used, excludePath);
        out += pm[0];
        last = pm.index + pm[0].length;
        // Guard against a zero-length match looping forever.
        if (pm[0].length === 0) PROTECTED_RE.lastIndex++;
      }
      out += linkifyFree(text.slice(last), used, excludePath);
      return out;
    },
  };
}
