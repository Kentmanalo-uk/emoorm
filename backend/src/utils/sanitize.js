/**
 * Server-side sanitisation of user-generated text.
 *
 * The React client escapes what it renders, so this is not the only defence —
 * but it must not be the only defence either. The same rows are read by the
 * Expo app, by admin exports, by notification emails and by anything built
 * later, and a stored `<script>` is a loaded gun waiting for the first
 * consumer that renders HTML. Values are cleaned on the way IN so what sits
 * in the database is safe for every reader.
 *
 * These fields are plain text in the UI — a shop name, a product description,
 * a review. None of them are meant to carry markup, so tags are removed
 * rather than escaped, which keeps legitimate content looking identical.
 */

/** Tags whose *contents* are dangerous, not just the tag itself. */
const DANGEROUS_BLOCKS = /<(script|style|iframe|object|embed|svg|math|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
/** The same tags when left unclosed, plus any other tag. */
const ANY_TAG = /<\/?[a-z][^>]*>/gi;
/** Bare `<script ...` with no closing tag at all, trailing `>` included. */
const ORPHAN_OPENERS = /<\s*\/?\s*(script|style|iframe|object|embed|svg|math|template)\b[^>]*>?/gi;
/** Angle brackets written as entities — a standard way to smuggle a tag past a filter. */
const BRACKET_ENTITIES = /&(?:lt|#0*60|#x0*3c);|&(?:gt|#0*62|#x0*3e);/gi;
/** HTML comments, which can hide conditional-comment payloads. */
const COMMENTS = /<!--[\s\S]*?-->/g;
/** Null bytes and control characters that break parsers or hide payloads. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Strip markup from a plain-text field.
 *
 * Content inside a dangerous tag is removed with the tag; for ordinary tags
 * only the tag itself goes, so "5 < 10 and 20 > 15" survives intact while
 * "<b>bold</b>" becomes "bold".
 *
 * @param {*} value - Raw user input
 * @param {Object} [options]
 * @param {Number} [options.maxLength] - Truncate after cleaning
 * @returns {String|*} Cleaned string, or the value unchanged if not a string
 */
const cleanText = (value, { maxLength } = {}) => {
  if (typeof value !== 'string') return value;

  // Decode bracket entities BEFORE stripping, not after. `&lt;script&gt;`
  // looks inert to a tag-matching regex but becomes live markup the moment a
  // consumer decodes it, so it has to be turned back into a real tag first
  // and then removed like any other.
  let out = value
    .replace(CONTROL_CHARS, '')
    .replace(BRACKET_ENTITIES, (entity) => (/lt|60|3c/i.test(entity) ? '<' : '>'))
    .replace(COMMENTS, '')
    .replace(DANGEROUS_BLOCKS, '')
    .replace(ORPHAN_OPENERS, '')
    .replace(ANY_TAG, '');

  out = out.replace(/\s+/g, ' ').trim();
  return maxLength ? out.slice(0, maxLength) : out;
};

/**
 * Clean a set of named fields on an object, in place on a copy.
 * Fields that are absent are left absent, so this is safe for partial updates.
 *
 * @param {Object} input - The request payload
 * @param {Object} spec - { fieldName: maxLength|true }
 * @returns {Object} A copy with those fields cleaned
 */
const cleanFields = (input, spec) => {
  if (!input || typeof input !== 'object') return input;
  const out = { ...input };
  for (const [field, limit] of Object.entries(spec)) {
    if (out[field] === undefined || out[field] === null) continue;
    out[field] = cleanText(out[field], typeof limit === 'number' ? { maxLength: limit } : {});
  }
  return out;
};

/**
 * Validate a user-supplied URL before it is stored and later rendered as a
 * link. Blocks javascript:, data:, vbscript: and similar, which turn an
 * innocent-looking banner or store link into script execution on click.
 *
 * @param {*} value - Candidate URL
 * @param {Object} [options]
 * @param {Boolean} [options.allowRelative] - Permit same-site paths like /products
 * @returns {String|null} The URL if safe, otherwise null
 */
const cleanUrl = (value, { allowRelative = true } = {}) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(CONTROL_CHARS, '');
  if (!trimmed) return null;

  if (allowRelative && trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;

  try {
    const url = new URL(trimmed);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

module.exports = { cleanText, cleanFields, cleanUrl };
