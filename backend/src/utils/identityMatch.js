/**
 * Pure helpers for reading OCR text from Philippine government IDs and
 * comparing it with a user's registered account details. No I/O here so the
 * rules can be tested in isolation.
 *
 * OCR output from phone photos is noisy ("ApetydolLast Nome" for
 * "Apelyido/Last Name", "1 234-5678-901 2-3456" for a card number), so every
 * comparison here is typo-tolerant.
 */

// Supported Philippine government IDs. `keywords` help pick the best OCR
// read; `numberPatterns` match the ID number after OCR spacing is removed.
// `hasAddress: false` marks cards that do not print the holder's address —
// those are verified on name and ID number only.
const ID_TYPES = {
  PHILSYS: {
    label: 'Philippine National ID (PhilSys)',
    keywords: [
      ['PAMBANSANG', 'PAGKAKAKILANLAN'],
      ['PHILIPPINE', 'IDENTIFICATION'],
      ['IDENTIFICATION', 'CARD'],
      ['PHILSYS'],
      ['PHILID'],
      ['EPHILID'],
    ],
    numberPatterns: [/\d{4}-?\d{4}-?\d{4}-?\d{4}/],
  },
  DRIVERS_LICENSE: {
    label: "Driver's License (LTO)",
    keywords: [['LAND', 'TRANSPORTATION'], ['DRIVERS', 'LICENSE'], ['DRIVER', 'LICENSE'], ['NON', 'PROFESSIONAL'], ['LTO']],
    numberPatterns: [/[A-Z]\d{2}-?\d{2}-?\d{6}/],
  },
  UMID: {
    label: 'UMID',
    keywords: [['UNIFIED', 'MULTI', 'PURPOSE'], ['UMID'], ['CRN']],
    numberPatterns: [/\d{4}-?\d{7}-?\d/],
  },
  POSTAL_ID: {
    label: 'Postal ID',
    keywords: [['POSTAL', 'IDENTITY'], ['POSTAL', 'ID'], ['PHILPOST'], ['PHILIPPINE', 'POSTAL']],
    numberPatterns: [/[A-Z]{3}\d{9,}[A-Z]?/],
  },
  VOTERS_ID: {
    label: "Voter's ID (COMELEC)",
    keywords: [['COMMISSION', 'ELECTIONS'], ['COMELEC'], ['VOTERS', 'IDENTIFICATION']],
    numberPatterns: [/\d{4}-?\d{4}[A-Z]{1,4}-?[A-Z]{0,4}\d{3,}[A-Z0-9-]*/],
  },
  PHILHEALTH: {
    label: 'PhilHealth ID',
    keywords: [['PHILHEALTH'], ['PHILIPPINE', 'HEALTH', 'INSURANCE']],
    numberPatterns: [/\d{2}-?\d{9}-?\d/],
  },
  TIN_ID: {
    label: 'TIN ID (BIR)',
    keywords: [['BUREAU', 'INTERNAL', 'REVENUE'], ['TAXPAYER'], ['BIR']],
    numberPatterns: [/\d{3}-?\d{3}-?\d{3}(?:-?\d{3,5})?/],
  },
  SENIOR_CITIZEN: {
    label: 'Senior Citizen ID',
    keywords: [['SENIOR', 'CITIZEN'], ['OSCA']],
    numberPatterns: [],
  },
  PWD_ID: {
    label: 'PWD ID',
    keywords: [['PERSONS', 'DISABILITY'], ['PWD']],
    numberPatterns: [/\d{2}-?\d{4}-?\d{3}-?\d{7}/],
  },
  BARANGAY_ID: {
    label: 'Barangay ID',
    keywords: [['BARANGAY', 'IDENTIFICATION'], ['BARANGAY', 'ID'], ['PUNONG', 'BARANGAY']],
    numberPatterns: [],
  },
  NBI_CLEARANCE: {
    label: 'NBI Clearance',
    keywords: [['NATIONAL', 'BUREAU', 'INVESTIGATION'], ['NBI', 'CLEARANCE']],
    numberPatterns: [/[A-Z]{3,}\d{6,}[A-Z0-9]*/],
  },
  PASSPORT: {
    label: 'Philippine Passport',
    keywords: [['PASAPORTE'], ['PASSPORT']],
    numberPatterns: [/[A-Z]{1,2}\d{7}[A-Z]?/],
    hasAddress: false,
  },
  PRC_ID: {
    label: 'PRC ID',
    keywords: [['PROFESSIONAL', 'REGULATION'], ['PRC']],
    numberPatterns: [/^\d{7}$/],
    hasAddress: false,
  },
  SSS_ID: {
    label: 'SSS ID',
    keywords: [['SOCIAL', 'SECURITY', 'SYSTEM'], ['SSS']],
    numberPatterns: [/\d{2}-?\d{7}-?\d/],
    hasAddress: false,
  },
};

const idTypeHasAddress = (idType) => ID_TYPES[idType]?.hasAddress !== false;

const COUNTRY_KEYWORDS = [['REPUBLIKA', 'PILIPINAS'], ['REPUBLIC', 'PHILIPPINES'], ['PILIPINAS'], ['PHILIPPINES']];

// Field labels as printed on the cards (Filipino and English).
const FIELD_LABELS = {
  // Middle name first: its Filipino label also contains APELYIDO.
  middleName: [['PANGGITNANG'], ['MIDDLE', 'NAME']],
  lastName: [['APELYIDO'], ['LAST', 'NAME'], ['SURNAME']],
  givenNames: [['MGA', 'PANGALAN'], ['GIVEN', 'NAMES'], ['GIVEN', 'NAME'], ['FIRST', 'NAME']],
  dateOfBirth: [['PETSA', 'KAPANGANAKAN'], ['DATE', 'BIRTH'], ['BIRTH', 'DATE']],
  address: [['TIRAHAN'], ['ADDRESS']],
};
// Driver's license style: "Last Name, First Name, Middle Name" on one label line.
const COMBINED_NAME_LABEL = ['LAST', 'NAME', 'FIRST', 'NAME'];
const OTHER_LABELS = [['SEX'], ['KASARIAN'], ['NATIONALITY'], ['BLOOD'], ['HEIGHT'], ['WEIGHT'], ['EXPIRATION'], ['AGENCY', 'CODE'], ['CIVIL', 'STATUS'], ['PLACE', 'BIRTH'], ['SIGNATURE'], ['LAGDA']];

const NAME_SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V']);
const ADDRESS_NOISE = new Set(['BARANGAY', 'BRGY', 'BGY', 'CITY', 'OF', 'MUNICIPALITY', 'MUN', 'PROVINCE', 'PROV', 'PHILIPPINES', 'PH']);
const ADDRESS_ABBREVIATIONS = { POB: 'POBLACION', STA: 'SANTA', STO: 'SANTO', SN: 'SAN', 'OR': 'ORIENTAL', ORL: 'ORIENTAL' };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = (value) => normalize(value).split(' ').filter(Boolean);

const levenshtein = (a, b) => {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
};

// Allowed OCR misreads grow with word length; short words must be exact.
const allowedEdits = (length, strict) => {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  if (strict) return length <= 8 ? 1 : 2;
  return length <= 9 ? 2 : 3;
};

const tokenMatches = (expected, actual, strict = false) => {
  if (expected === actual) return true;
  const edits = allowedEdits(expected.length, strict);
  if (!edits || Math.abs(expected.length - actual.length) > edits) return false;
  return levenshtein(expected, actual) <= edits;
};

// Candidate tokens include joined neighbours ("DELA CRUZ" ~ "DELACRUZ") and
// OCR-glued label words split on the common separators.
const buildCandidates = (tokens) => {
  const candidates = new Set(tokens);
  for (let i = 0; i < tokens.length - 1; i += 1) candidates.add(tokens[i] + tokens[i + 1]);
  return [...candidates];
};

const containsToken = (candidates, expected, strict = false) =>
  candidates.some((c) => tokenMatches(expected, c, strict));

const containsPhrase = (candidates, words) => words.every((word) => containsToken(candidates, word));

// Loose label detection: OCR often glues "Apelyido/Last" into one token, so
// also test whether a label word is a fuzzy prefix/suffix of a token.
const lineHasLabel = (line, words) => {
  const tokens = tokenize(line);
  const compact = normalize(line).replace(/\s/g, '');
  return words.every((word) => (
    tokens.some((t) => tokenMatches(word, t))
    || (word.length >= 5 && compact.includes(word))
    || (word.length >= 6 && tokens.some((t) => t.length > word.length
      && (tokenMatches(word, t.slice(0, word.length)) || tokenMatches(word, t.slice(-word.length)))))
  ));
};

/**
 * Value printed on the label's own line ("Last Name: DELA CRUZ"): the words
 * after the last label word. Noise before the label is ignored.
 */
const sameLineValue = (line, words) => {
  const tokens = tokenize(line);
  let last = -1;
  tokens.forEach((token, i) => {
    if (words.some((word) => tokenMatches(word, token)
      || (word.length >= 6 && token.length > word.length && tokenMatches(word, token.slice(-word.length))))) {
      last = i;
    }
  });
  const rest = last >= 0 ? tokens.slice(last + 1) : [];
  return rest.some((t) => /[A-Z]{2,}/.test(t)) ? rest.join(' ') : '';
};

const isLabelLine = (line) => {
  const all = [...Object.values(FIELD_LABELS).flat(), ...OTHER_LABELS];
  return all.some((words) => lineHasLabel(line, words));
};

const scoreKeywords = (text, keywordSets) => {
  const candidates = buildCandidates(tokenize(text));
  return keywordSets.filter((phrase) => containsPhrase(candidates, phrase)).length;
};

// OCR confuses letters and digits inside numbers; fix them only in
// digit-heavy runs so names are untouched.
const DIGIT_FIXES = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', S: '5', B: '8', Z: '2', G: '6' };

const numberRuns = (text) => {
  const runs = [];
  for (const rawLine of String(text || '').toUpperCase().split(/\r?\n/)) {
    // Drop number labels ("ID No.", "SS No:", "VIN", "CRN-") so they don't stick to the digits.
    const line = rawLine
      .replace(/\b(?:ID|SS|LICENSE|REGISTRATION|CONTROL|CARD|PSN|PCN)?\s*NO\b[.:#]?/g, ' ')
      .replace(/\b(?:VIN|PRN|CRN|TIN)\b[\s.:#-]*/g, ' ');
    // Collapse spaces and dots OCR inserts inside digit groups.
    const chunks = line.match(/[A-Z0-9|][A-Z0-9|\s.\-]{4,}[A-Z0-9|]/g) || [];
    for (const chunk of chunks) {
      const compact = chunk.replace(/[\s.]/g, '').replace(/-+/g, '-');
      const digits = (compact.match(/\d/g) || []).length;
      if (digits >= 6) runs.push(compact);
    }
  }
  return runs;
};

const fixDigits = (run) => run.replace(/[OQDILSBZG|]/g, (ch, i) => {
  const prev = run[i - 1];
  const next = run[i + 1];
  return /\d|-/.test(prev || '') || /\d|-/.test(next || '') ? DIGIT_FIXES[ch] : ch;
});

const extractIdNumber = (text, idType) => {
  const runs = numberRuns(text);
  for (const pattern of ID_TYPES[idType]?.numberPatterns || []) {
    for (const run of runs) {
      for (const variant of [run, fixDigits(run)]) {
        const match = variant.match(pattern);
        if (match) return match[0];
      }
    }
  }
  // Fallback: the longest run with at least 6 digits that isn't a date.
  const looksLikeDate = (run) => /^\d{4}-\d{1,2}-\d{1,2}$/.test(run) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(run);
  const generic = runs
    // Leading words ("DATEOFBIRTH") are text glued to the digits, not part of an ID.
    .map((run) => fixDigits(run.replace(/^[A-Z]{4,}/, '')).replace(/^-+|-+$/g, ''))
    .filter((run) => (run.match(/\d/g) || []).length >= 6 && !looksLikeDate(run))
    .sort((a, b) => b.length - a.length);
  return generic[0] || null;
};

const toIsoDate = (year, month, day) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCDate() !== d || date > new Date() || y < 1900) return null;
  return date.toISOString().slice(0, 10);
};

const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

// "JANUARV" → 1, "SEPT" → 9; returns 0 when the word is not a month.
const monthNumber = (word) => {
  const abbr = MONTHS.indexOf(word.slice(0, 3));
  if (abbr >= 0 && MONTH_NAMES[abbr].startsWith(word)) return abbr + 1;
  const full = MONTH_NAMES.findIndex((name) => word.length >= 5 && tokenMatches(name, word));
  return full + 1;
};

const findDates = (text) => {
  const upper = String(text || '').toUpperCase().replace(/[^A-Z0-9/\-\s]/g, ' ').replace(/[ \t]+/g, ' ');
  const dates = [];
  for (const m of upper.matchAll(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/g)) dates.push(toIsoDate(m[1], m[2], m[3]));
  for (const m of upper.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)) dates.push(toIsoDate(m[3], m[1], m[2]));
  for (const m of upper.matchAll(/\b([A-Z]{3,9}) (\d{1,2}) (\d{4})\b/g)) {
    const month = monthNumber(m[1]);
    if (month) dates.push(toIsoDate(m[3], month, m[2]));
  }
  for (const m of upper.matchAll(/\b(\d{1,2}) ([A-Z]{3,9}) (\d{4})\b/g)) {
    const month = monthNumber(m[2]);
    if (month) dates.push(toIsoDate(m[3], month, m[1]));
  }
  return dates.filter(Boolean);
};

/**
 * Reads labelled fields. For each label, the value is the text after the
 * label on the same line, otherwise the following non-label line(s).
 */
const extractFields = (text) => {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fields = {};

  // `fragmentLines` extra lines are accepted only when short — the tail of a
  // word OCR wrapped onto its own line (e.g. "DORO" from "MINDORO").
  const valueAfter = (index, maxLines, fragmentLines = 0) => {
    const values = [];
    let fragments = 0;
    for (let i = index + 1; i < lines.length; i += 1) {
      if (isLabelLine(lines[i])) break;
      if (!/[A-Z]{2,}/i.test(lines[i])) continue;
      if (values.length < maxLines) {
        values.push(lines[i]);
      } else if (fragments < fragmentLines && normalize(lines[i]).length <= 20) {
        values.push(lines[i]);
        fragments += 1;
      } else {
        break;
      }
    }
    return values.join('\n');
  };

  // The text may hold several OCR passes of the same card, so every address
  // block is kept; each pass can recover words another pass split.
  const addressBlocks = [];
  lines.forEach((line, index) => {
    if (lineHasLabel(line, COMBINED_NAME_LABEL) && !fields.combinedName) {
      fields.combinedName = sameLineValue(line, COMBINED_NAME_LABEL) || valueAfter(index, 1);
      return;
    }
    for (const [field, labelSets] of Object.entries(FIELD_LABELS)) {
      if (!labelSets.some((words) => lineHasLabel(line, words))) continue;
      const inline = sameLineValue(line, labelSets.flat());
      if (field === 'address') {
        const block = inline ? [inline, valueAfter(index, 1, 1)].filter(Boolean).join('\n') : valueAfter(index, 2, 1);
        if (block) addressBlocks.push(block);
      } else if (!fields[field]) {
        fields[field] = inline || valueAfter(index, 1);
      }
      break;
    }
  });

  // "DELA CRUZ, JUAN SANTOS" → last name before the comma; the final given
  // word is the middle name.
  if (fields.combinedName && !fields.lastName) {
    const [last, rest = ''] = fields.combinedName.split(',');
    const given = tokenize(rest);
    fields.lastName = last;
    fields.givenNames = (given.length > 1 ? given.slice(0, -1) : given).join(' ');
    fields.middleName = given.length > 1 ? given[given.length - 1] : '';
  }

  const dobDates = findDates(fields.dateOfBirth);
  const allDates = findDates(text).sort();
  return {
    lastName: normalize(fields.lastName) || null,
    givenNames: normalize(fields.givenNames) || null,
    middleName: normalize(fields.middleName) || null,
    // The birth date is the earliest date on the card (others are issue/expiry).
    dateOfBirth: dobDates[0] || allDates[0] || null,
    address: normalize(addressBlocks[0]) || null,
    addressText: addressBlocks.join('\n'),
  };
};

const nameTokens = (value) => tokenize(value).filter((t) => t.length >= 2 && !NAME_SUFFIXES.has(t) && !/\d/.test(t));

const contentLines = (text) => String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

// Minimum share of matching words for a name or address to count as a match.
// Kept at half so a partly unreadable ID photo can still verify.
const MATCH_THRESHOLD = 0.5;

const ratio = (found, total) => (total === 0 ? 1 : found / total);

/**
 * Name similarity (0–1): the share of account name words found on the ID.
 * The ID name must also be mostly the account's (at least half its words),
 * so a block of unrelated text cannot score well. Typos are tolerated.
 */
const scoreName = (expected, idName) => {
  const idWords = nameTokens(idName);
  if (expected.length === 0 || idWords.length === 0) return 0;
  const idPool = buildCandidates(idWords);
  const accountPool = buildCandidates(expected);
  const accountFound = expected.filter((t) => containsToken(idPool, t, true)).length;
  const idFound = idWords.filter((t) => containsToken(accountPool, t, true)).length;
  return ratio(idFound, idWords.length) >= 0.5 ? ratio(accountFound, expected.length) : 0;
};

/**
 * Name rule: the ID name (labelled fields, or else the best-matching block of
 * up to 3 consecutive lines) must be at least 50% similar to the account name.
 */
const matchName = (accountName, fields, ocrText) => {
  const expected = nameTokens(accountName);
  let idName = '';
  let score = 0;

  if (fields.lastName && fields.givenNames) {
    idName = [fields.givenNames, fields.middleName, fields.lastName].filter(Boolean).join(' ');
    // The account may leave out the middle name, so score with and without it.
    score = Math.max(
      scoreName(expected, idName),
      scoreName(expected, [fields.givenNames, fields.lastName].filter(Boolean).join(' ')),
    );
  } else {
    const lines = contentLines(ocrText);
    for (let start = 0; start < lines.length; start += 1) {
      for (let size = 1; size <= 3 && start + size <= lines.length; size += 1) {
        const block = lines.slice(start, start + size);
        if (block.some(isLabelLine)) break;
        const candidate = block.join(' ');
        const candidateScore = scoreName(expected, candidate);
        if (candidateScore > score) {
          score = candidateScore;
          idName = candidate;
        }
      }
    }
  }

  return { matched: score >= MATCH_THRESHOLD, score, idName: normalize(idName) || null };
};

/**
 * OCR sometimes breaks a word across lines ("POBLAC" … "ION"). Accept a word
 * of 7+ letters when it appears whole in the de-spaced text, or when a token
 * ends with its first part and another token starts with the rest.
 */
const containsSplitWord = (text, word) => {
  if (word.length < 7) return false;
  if (normalize(text).replace(/\s/g, '').includes(word)) return true;
  const tokens = tokenize(text);
  for (let k = 3; k <= word.length - 3; k += 1) {
    const head = word.slice(0, k);
    const tail = word.slice(k);
    if (tokens.some((t) => t.endsWith(head)) && tokens.some((t) => t.startsWith(tail))) return true;
  }
  return false;
};

const addressTokens = (value) => tokenize(value)
  .map((t) => ADDRESS_ABBREVIATIONS[t] || t)
  .filter((t) => !ADDRESS_NOISE.has(t));

/**
 * Address text read from the ID: lines after "Address"/"Tirahan" labels,
 * plus lines around the municipality name (recovers words OCR split across
 * lines). Falls back to the whole card when neither was found.
 */
const findAddressText = (municipality, fields, ocrText) => {
  const lines = contentLines(ocrText);
  const nearby = [];
  lines.forEach((line, index) => {
    const lineTokens = buildCandidates(addressTokens(line));
    if (municipality.length === 0 || !municipality.every((t) => containsToken(lineTokens, t))) return;
    nearby.push(lines.slice(Math.max(0, index - 1), index + 2).filter((l) => !isLabelLine(l)).join('\n'));
  });
  const text = [fields.addressText, ...nearby].filter(Boolean).join('\n');
  return text || String(ocrText || '');
};

/**
 * Address rule: at least 50% of the registered address words (street,
 * barangay, municipality, province) must appear in the ID's address.
 */
const matchAddress = ({ municipalityName, barangay, province, street }, fields, ocrText) => {
  const words = [...new Set([
    ...addressTokens(street).filter((t) => t.length >= 3 || /\d/.test(t)),
    ...addressTokens(barangay),
    ...addressTokens(municipalityName),
    ...addressTokens(province),
  ])];
  const text = findAddressText(addressTokens(municipalityName), fields, ocrText);
  const pool = buildCandidates(addressTokens(text));
  const found = words.filter((t) => containsToken(pool, t) || containsSplitWord(text, t)).length;
  const score = words.length === 0 ? 0 : found / words.length;
  return { matched: score >= MATCH_THRESHOLD, score };
};

/** Heuristic OCR quality score used to pick the best rotation/variant. */
const scoreText = (text) => {
  const candidates = buildCandidates(tokenize(text));
  const keywordHits = Object.values(ID_TYPES)
    .reduce((sum, def) => sum + def.keywords.filter((p) => containsPhrase(candidates, p)).length, 0);
  const labelHits = Object.values(FIELD_LABELS)
    .filter((sets) => sets.some((words) => String(text).split(/\r?\n/).some((l) => lineHasLabel(l, words)))).length;
  const words = tokenize(text).filter((t) => t.length >= 4 && /^[A-Z]+$/.test(t)).length;
  return keywordHits * 5 + scoreKeywords(text, COUNTRY_KEYWORDS) * 5 + labelHits * 3
    + (numberRuns(text).length > 0 ? 4 : 0) + Math.min(words, 20) * 0.5;
};

module.exports = {
  ID_TYPES,
  idTypeHasAddress,
  normalize,
  extractIdNumber,
  extractFields,
  matchName,
  matchAddress,
  scoreText,
};
