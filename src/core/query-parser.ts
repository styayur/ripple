export type QueryField = 'text' | 'title' | 'alias' | 'tag' | 'path' | 'content';
export interface QueryTerm {
  readonly field: QueryField;
  readonly value: string;
  readonly exclude: boolean;
}
export interface ParsedQuery {
  readonly terms: readonly QueryTerm[];
  readonly empty: boolean;
}

export function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** Whitespace-separated terms, quoted phrases, field:value, -exclusions. No regex/eval. */
export function parseQuery(input: string): ParsedQuery {
  if (input.length > 512) throw new Error('Query is limited to 512 characters.');
  const tokens: string[] = [];
  let token = '';
  let quoted = false;
  for (const char of input.trim()) {
    if (char === '"') quoted = !quoted;
    else if (/\s/u.test(char) && !quoted) {
      if (token) tokens.push(token);
      token = '';
    } else token += char;
  }
  if (quoted) throw new Error('Close the quoted phrase.');
  if (token) tokens.push(token);
  if (tokens.length > 32) throw new Error('Use at most 32 query terms.');
  const terms = tokens.map((raw): QueryTerm => {
    const exclude = raw.startsWith('-');
    const body = exclude ? raw.slice(1) : raw;
    const colon = body.indexOf(':');
    const field = colon < 0 ? 'text' : body.slice(0, colon);
    if (!['text', 'title', 'alias', 'tag', 'path', 'content'].includes(field)) {
      throw new Error(`Unknown field: ${field}. Use title, alias, tag, path or content.`);
    }
    const value = normalizeText(colon < 0 ? body : body.slice(colon + 1));
    if (!value) throw new Error('Each query term needs a value.');
    return { field: field as QueryField, value, exclude };
  });
  return { terms, empty: terms.length === 0 };
}
