/**
 * Content negotiation over the `Accept` header, so one URL can answer both
 * readers this site has. A browser asks for `text/html` and gets the page; an
 * agent asks for `text/markdown` and gets the same words without the markup.
 *
 * The rules are RFC 9110's, which acceptmarkdown.com restates as a checklist:
 * the most specific media range that matches an offer decides that offer's
 * quality, a q of 0 rules an offer out, and a request that rules out every
 * offer is a 406 rather than a guess. Nothing here reads a request or writes a
 * response, so the whole of it is testable from the repository's own suite.
 */

/** One entry of an `Accept` header, after its parameters are dropped. */
export interface MediaRange {
  type: string;
  subtype: string;
  quality: number;
}

/** How well a range names an offer: exactly, by type, or not at all. */
const EXACT = 2;
const SUBTYPE_WILDCARD = 1;
const FULL_WILDCARD = 0;
const NO_MATCH = -1;

/** A qvalue, near enough: RFC 9110 allows at most three decimal places. */
const QVALUE = /^\d(?:\.\d{1,3})?$/u;

/**
 * A quality between 0 and 1, or 1 when the parameter is absent or unreadable.
 * A malformed q is the client's problem, and refusing to serve it is a worse
 * answer than treating the range as unweighted.
 */
function quality(parameters: string[]): number {
  for (const parameter of parameters) {
    const [name, value] = parameter.split('=', 2);
    if (name?.trim().toLowerCase() !== 'q') continue;
    const trimmed = value?.trim() ?? '';
    if (!QVALUE.test(trimmed)) return 1;
    // Only 0 and 1 are in range; anything above clamps rather than being read
    // as a stronger preference than the scale has.
    return Math.min(Number(trimmed), 1);
  }
  return 1;
}

/**
 * Splits an `Accept` header into its ranges. Parameters other than `q` are
 * dropped: this site offers one representation per media type, so there is
 * nothing for a `charset` or a `profile` to choose between.
 */
export function parseAccept(header: string | null | undefined): MediaRange[] {
  if (!header) return [];
  const ranges: MediaRange[] = [];

  for (const entry of header.split(',')) {
    const [range, ...parameters] = entry.split(';');
    const [type, subtype] = (range ?? '').trim().toLowerCase().split('/', 2);
    if (!type || !subtype) continue;
    ranges.push({ type, subtype, quality: quality(parameters) });
  }

  return ranges;
}

/** How specifically `range` names `type/subtype`, or NO_MATCH. */
function specificity(range: MediaRange, type: string, subtype: string): number {
  if (range.type === '*' && range.subtype === '*') return FULL_WILDCARD;
  if (range.type !== type) return NO_MATCH;
  if (range.subtype === '*') return SUBTYPE_WILDCARD;
  return range.subtype === subtype ? EXACT : NO_MATCH;
}

/**
 * The quality this header gives one media type. The most specific matching
 * range wins, which is what keeps the trailing wildcard a browser sends at
 * `q=0.8` from reading as an equal preference for everything it did name.
 */
function qualityOf(ranges: MediaRange[], offer: string): number {
  const [type, subtype] = offer.toLowerCase().split('/', 2);
  let best = NO_MATCH;
  let matched = 0;

  for (const range of ranges) {
    const rank = specificity(range, type ?? '', subtype ?? '');
    if (rank > best) {
      best = rank;
      matched = range.quality;
    }
  }

  return best === NO_MATCH ? 0 : matched;
}

/**
 * The representation to serve, or `undefined` when the client accepts none of
 * them and the answer is a 406.
 *
 * `offered` is the server's own preference order, so it decides a tie: a client
 * that names both, or names neither and sends only a wildcard, gets whichever
 * the caller put first. That is what keeps HTML the default for the page while
 * letting the 404 hand markdown to anything that did not ask for a browser page.
 */
export function chooseType(
  header: string | null | undefined,
  offered: readonly string[],
): string | undefined {
  const first = offered[0];
  if (first === undefined) return undefined;

  const ranges = parseAccept(header);
  // No `Accept` at all, or nothing parseable in it, is not a refusal: RFC 9110
  // reads a missing header as accepting anything.
  if (ranges.length === 0) return first;

  let chosen: string | undefined;
  let best = 0;

  for (const offer of offered) {
    const score = qualityOf(ranges, offer);
    if (score > best) {
      best = score;
      chosen = offer;
    }
  }

  return chosen;
}
