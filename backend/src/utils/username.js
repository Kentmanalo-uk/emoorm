/**
 * Public usernames.
 *
 * A username is the one handle shown next to a person's name on their public
 * profile and on their shop, so it has to be stable, unambiguous and never
 * derived from anything private. Everything here works on the stored form:
 * lowercase, 3-20 characters, letters/digits/dot/underscore.
 */

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

/** Handles the platform keeps for itself or that would read as official. */
const RESERVED = [
  'admin', 'administrator', 'emoorm', 'support', 'help', 'system', 'root',
  'seller', 'buyer', 'shop', 'store', 'api', 'www', 'moderator', 'staff',
  'official',
];

const FORMAT = /^[a-z0-9_.]+$/;
const STARTS_OK = /^[a-z0-9]/;

/**
 * Put a candidate into its stored form: trimmed and lowercase.
 * @param {*} value - Raw input
 * @returns {String} Normalized username
 */
const normalizeUsername = (value) => String(value ?? '').trim().toLowerCase();

/**
 * Check a normalized username against the rules.
 * @param {String} value - Username, already normalized
 * @returns {String|null} The first rule it breaks, or null when it is valid
 */
const validateUsername = (value) => {
  const username = normalizeUsername(value);

  if (!username) return 'Username is required';
  if (username.length < MIN_LENGTH || username.length > MAX_LENGTH) {
    return `Username must be ${MIN_LENGTH}-${MAX_LENGTH} characters`;
  }
  if (!FORMAT.test(username)) {
    return 'Username can only contain lowercase letters, numbers, dots and underscores';
  }
  if (!STARTS_OK.test(username)) {
    return 'Username must start with a letter or a number';
  }
  if (username.includes('..')) {
    return 'Username cannot contain two dots in a row';
  }
  if (RESERVED.includes(username)) {
    return 'That username is reserved';
  }
  return null;
};

/**
 * Strip a free-text string down to username characters.
 * @param {*} value - Any text
 * @returns {String} Slug, possibly empty
 */
const slugify = (value) => normalizeUsername(value)
  .replace(/[^a-z0-9_.]+/g, '')
  .replace(/\.{2,}/g, '.')
  .replace(/^[^a-z0-9]+/, '')
  .replace(/[^a-z0-9]+$/, '');

/**
 * Propose a base handle for an account from its public details only —
 * the display name, else the email local part, else a generic stem.
 * Never derived from a phone number or any other private field.
 *
 * The result is a *base*: it is truncated to 16 so the caller has room to
 * append digits until it is unique, and it is not guaranteed to be free.
 *
 * @param {String} name - Display name
 * @param {String} email - Email address (only the part before the @ is used)
 * @returns {String} Base handle, 3-16 characters
 */
const suggestFromName = (name, email) => {
  const candidates = [
    slugify(name),
    slugify(String(email ?? '').split('@')[0]),
    'user',
  ];

  let base = candidates.find((c) => c.length >= MIN_LENGTH) || 'user';
  base = base.slice(0, 16).replace(/[^a-z0-9]+$/, '');
  if (base.length < MIN_LENGTH || RESERVED.includes(base)) base = `${base}user`.slice(0, 16);
  return base;
};

module.exports = {
  RESERVED,
  MIN_LENGTH,
  MAX_LENGTH,
  normalizeUsername,
  validateUsername,
  slugify,
  suggestFromName,
};
