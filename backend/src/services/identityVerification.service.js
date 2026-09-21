const config = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');
const identityRepository = require('../repositories/identityVerification.repository');
const userRepository = require('../repositories/user.repository');
const appSettingService = require('./appSetting.service');
const auditLogService = require('./auditLog.service');
const { recognizeId } = require('../utils/identityOcr');
const { encryptJson, hashIdNumber } = require('../utils/identityCrypto');
const {
  ID_TYPES,
  idTypeHasAddress,
  extractIdNumber,
  extractFields,
  matchName,
  matchAddress,
} = require('../utils/identityMatch');

/**
 * Identity Verification Service
 * Verifies a buyer by OCR-reading a Philippine government ID and matching it
 * against the account's registered name and address. The ID image is only
 * held in memory for the duration of the request.
 */

const PENDING_TIMEOUT_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_TEXT_LENGTH = 40;

const FAILURE_MESSAGES = {
  UNREADABLE: "We couldn't read your ID. Retake the photo in good lighting, without glare, and with the whole card in frame.",
  ID_NUMBER_NOT_FOUND: "We couldn't read the ID number. Make sure it is clearly visible and try again.",
  NAME_MISMATCH: 'The name on your ID does not match the name on your account. Update your profile name to match your ID, then try again.',
  ADDRESS_MISMATCH: 'The address on your ID does not match the address on your account. Update your profile address to match your ID, then try again.',
  ID_ALREADY_USED: 'This ID has already been used to verify another account.',
};

const idTypeOptions = () => Object.entries(ID_TYPES).map(([value, { label }]) => ({
  value,
  label,
  hasAddress: idTypeHasAddress(value),
}));

const toPublicStatus = (record, attemptsUsed = 0, requiredForCheckout = true) => {
  let status = record?.status || 'NOT_VERIFIED';
  // A PENDING row left behind by a crashed request should not block retries.
  if (status === 'PENDING' && record.lastAttemptAt && Date.now() - record.lastAttemptAt.getTime() > PENDING_TIMEOUT_MS) {
    status = 'FAILED';
  }
  return {
    status,
    idType: record?.idType || null,
    idTypeLabel: record?.idType === 'IN_PERSON'
      ? 'an in-person check by your municipal admin'
      : record?.idType ? ID_TYPES[record.idType]?.label || record.idType : null,
    failureReason: status === 'FAILED' ? record?.failureReason || FAILURE_MESSAGES.UNREADABLE : null,
    verifiedAt: record?.verifiedAt || null,
    lastAttemptAt: record?.lastAttemptAt || null,
    attemptsRemaining: config.identity.maxAttemptsPerDay > 0
      ? Math.max(0, config.identity.maxAttemptsPerDay - attemptsUsed)
      : null,
    requiredForCheckout,
    supportedIdTypes: idTypeOptions(),
  };
};

const getStatus = async (userId) => {
  const [record, attemptsUsed, requiredForCheckout] = await Promise.all([
    identityRepository.findByUserId(userId),
    identityRepository.countRecentAttempts(userId, new Date(Date.now() - DAY_MS)),
    appSettingService.isBuyerVerificationRequired(),
  ]);
  return toPublicStatus(record, attemptsUsed, requiredForCheckout);
};

const isVerified = async (userId) => {
  const record = await identityRepository.findByUserId(userId);
  return record?.status === 'VERIFIED';
};

/** Backend checkout gate — called before any order is created. */
const assertVerifiedForCheckout = async (userId) => {
  if (!(await appSettingService.isBuyerVerificationRequired())) return;
  if (await isVerified(userId)) return;
  throw new ApiError(
    'Identity verification required. Please verify your identity before checking out.',
    403,
    [{ code: 'IDENTITY_VERIFICATION_REQUIRED' }]
  );
};

/**
 * Extracts the ID fields from OCR text and checks them against the account:
 * readable text, an ID number, and name/address at least 50% similar.
 * Returns { verified, failureCode, checks, scores, extracted, idNumber }.
 */
/** Text of both sides, kept as separate lines for the line-based checks. */
const joinSides = (frontText, backText) => [frontText, backText]
  .map((t) => String(t || '').trim())
  .filter(Boolean)
  .join('\n');

const evaluate = (text, idType, user) => {
  const readable = String(text || '').replace(/\s/g, '').length >= MIN_TEXT_LENGTH;
  const fields = extractFields(text);
  // The selected ID type only hints at the ID number format; the decision
  // rests on the extracted text, not on recognising the card design.
  const idNumber = extractIdNumber(text, idType);
  const name = matchName(user.fullName, fields, text);
  // Passports, PRC and SSS cards carry no address; they rely on name + ID number.
  const address = idTypeHasAddress(idType)
    ? matchAddress({
      municipalityName: user.municipality?.name,
      barangay: user.barangay,
      province: user.province,
      street: user.address,
    }, fields, text)
    : { matched: true, score: 1, skipped: true };

  // Kept for the audit log only; never returned to the client.
  const checks = [
    { key: 'readable', passed: readable },
    { key: 'idNumber', passed: readable && Boolean(idNumber) },
    { key: 'name', passed: readable && name.matched },
    { key: 'address', passed: readable && address.matched },
  ];

  let failureCode = null;
  if (!readable) failureCode = 'UNREADABLE';
  else if (!idNumber) failureCode = 'ID_NUMBER_NOT_FOUND';
  else if (!name.matched) failureCode = 'NAME_MISMATCH';
  else if (!address.matched) failureCode = 'ADDRESS_MISMATCH';

  return {
    verified: failureCode === null,
    failureCode,
    idNumber,
    nameMatched: name.matched,
    addressMatched: address.matched,
    checks,
    scores: { name: Math.round(name.score * 100), address: Math.round(address.score * 100) },
    // Stored encrypted on success; never returned to the client.
    extracted: {
      fullName: name.idName,
      address: fields.address,
      dateOfBirth: fields.dateOfBirth,
    },
  };
};

/**
 * Runs OCR on the uploaded ID and updates the user's verification status.
 * Both sides are read when a back photo is sent (many IDs print the address
 * there) and the checks run against the two sides together.
 * @param {Object} actor - req.user
 * @param {String} idType - key of ID_TYPES
 * @param {Buffer|{front: Buffer, back?: Buffer}} images - in-memory uploads; never persisted
 * @param {Object} req - Express request (audit IP/UA)
 */
const submit = async (actor, idType, images, req) => {
  const front = Buffer.isBuffer(images) ? images : images?.front;
  const back = Buffer.isBuffer(images) ? null : images?.back;
  if (!ID_TYPES[idType]) throw new ApiError('Please select a supported ID type', 400);
  if (!front?.length) throw new ApiError('Please upload a photo of the front of your ID', 400);

  const userId = actor.id;
  const [existing, user, attemptsUsed] = await Promise.all([
    identityRepository.findByUserId(userId),
    userRepository.findById(userId),
    identityRepository.countRecentAttempts(userId, new Date(Date.now() - DAY_MS)),
  ]);
  if (!user) throw new ApiError('User not found', 404);

  if (existing?.status === 'VERIFIED') throw new ApiError('Your identity is already verified', 409);
  if (existing?.status === 'PENDING' && existing.lastAttemptAt
    && Date.now() - existing.lastAttemptAt.getTime() < PENDING_TIMEOUT_MS) {
    throw new ApiError('A verification is already in progress. Please wait a moment.', 409);
  }
  if (config.identity.maxAttemptsPerDay > 0 && attemptsUsed >= config.identity.maxAttemptsPerDay) {
    throw new ApiError('Too many verification attempts. Please try again in 24 hours.', 429);
  }

  await identityRepository.upsertForUser(userId, {
    status: 'PENDING',
    idType,
    failureReason: null,
    lastAttemptAt: new Date(),
    attemptCount: (existing?.attemptCount || 0) + 1,
  });

  let outcome;
  let confidence = 0;
  let ocrText = '';
  try {
    const frontOcr = await recognizeId(front, {
      accept: (text) => evaluate(text, idType, user).verified,
    });
    let combined = frontOcr.text;
    confidence = Math.round(frontOcr.confidence);

    if (back?.length) {
      const backOcr = await recognizeId(back, {
        // The back only has to complete what the front is missing.
        accept: (text) => evaluate(joinSides(frontOcr.text, text), idType, user).verified,
      });
      combined = joinSides(frontOcr.text, backOcr.text);
      confidence = Math.round((frontOcr.confidence + backOcr.confidence) / 2);
    }

    ocrText = combined;
    outcome = evaluate(combined, idType, user);
  } catch (err) {
    console.error('[identity] OCR failed:', err.message);
    outcome = { verified: false, failureCode: 'UNREADABLE', nameMatched: false, addressMatched: false };
  }

  let idNumberHash = null;
  if (outcome.verified) {
    idNumberHash = hashIdNumber(idType, outcome.idNumber);
    const owner = await identityRepository.findByIdNumberHash(idNumberHash);
    if (owner && owner.userId !== userId) {
      outcome = { ...outcome, verified: false, failureCode: 'ID_ALREADY_USED' };
    }
  }

  let record;
  if (outcome.verified) {
    try {
      record = await identityRepository.upsertForUser(userId, {
        status: 'VERIFIED',
        idType,
        encryptedData: encryptJson({ ...outcome.extracted, idType }),
        idNumberHash,
        failureReason: null,
        verifiedAt: new Date(),
      });
    } catch (err) {
      if (err.code !== 'P2002') throw err;
      // Another account claimed this ID number concurrently.
      outcome = { ...outcome, verified: false, failureCode: 'ID_ALREADY_USED' };
    }
  }
  if (!outcome.verified) {
    record = await identityRepository.upsertForUser(userId, {
      status: 'FAILED',
      idType,
      encryptedData: null,
      idNumberHash: null,
      failureReason: FAILURE_MESSAGES[outcome.failureCode],
      verifiedAt: null,
    });
  }

  // Audit trail carries no ID image, number or extracted personal data.
  await auditLogService.record({
    actor,
    action: 'IDENTITY_VERIFICATION_ATTEMPT',
    entity: 'IdentityVerification',
    entityId: record.id,
    details: {
      idType,
      result: outcome.verified ? 'VERIFIED' : 'FAILED',
      failureCode: outcome.failureCode,
      checks: Object.fromEntries((outcome.checks || []).map((c) => [c.key, c.passed])),
      scores: outcome.scores,
      ocrConfidence: confidence,
    },
    req,
  });

  // Users only see success or failure; extracted details stay server-side.
  const response = toPublicStatus(record, attemptsUsed + 1);
  if (config.identity.debugOcr) {
    // Local tuning aid only: raw OCR text and match scores for the uploader.
    response.debug = { ocrText, scores: outcome.scores };
  }
  return response;
};

/**
 * Revokes a verification when the name/address it was matched against changes.
 */
const invalidateIfVerified = async (actor, changedFields, req) => {
  const record = await identityRepository.findByUserId(actor.id);
  if (record?.status !== 'VERIFIED') return;

  await identityRepository.upsertForUser(actor.id, {
    status: 'NOT_VERIFIED',
    encryptedData: null,
    idNumberHash: null,
    verifiedAt: null,
    failureReason: null,
  });
  await auditLogService.record({
    actor,
    action: 'IDENTITY_VERIFICATION_REVOKED',
    entity: 'IdentityVerification',
    entityId: record.id,
    details: { reason: 'PROFILE_CHANGED', changedFields },
    req,
  });
};

module.exports = {
  getStatus,
  isVerified,
  assertVerifiedForCheckout,
  submit,
  invalidateIfVerified,
  evaluate,
};
