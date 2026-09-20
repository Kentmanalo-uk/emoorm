const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const config = require('../config/env');

/**
 * KYC retention
 *
 * ID photos and permits are only needed while an application is being
 * reviewed. Keeping them forever is the most sensitive thing this app stores,
 * so once a decision is a retention period old the files are deleted from disk
 * and the columns cleared. The verification itself is not undone — the
 * account stays approved, and the IdentityVerification record (which holds no
 * photo) remains the durable proof that a human or OCR checked the ID.
 */

const KYC_COLUMNS = ['idFrontUrl', 'idBackUrl', 'selfieUrl', 'sellerPermitUrl'];

/**
 * Delete one stored KYC file. Only the basename is used so a tampered value
 * can never point outside the private upload directory.
 * @param {String} storedValue - Column value (an opaque filename)
 * @returns {Boolean} True if a file was removed
 */
const removeStoredFile = (storedValue) => {
  if (!storedValue) return false;
  const safeFilename = path.basename(storedValue);
  const isLegacyPublicPath = storedValue.startsWith('/uploads/');
  const baseDir = isLegacyPublicPath ? config.upload.uploadDir : config.upload.privateUploadDir;
  const absolutePath = path.resolve(baseDir, safeFilename);

  try {
    if (!fs.existsSync(absolutePath)) return false;
    fs.unlinkSync(absolutePath);
    return true;
  } catch (error) {
    console.error('[kyc-retention] could not delete', safeFilename, '-', error.message);
    return false;
  }
};

/**
 * Purge KYC documents for applications reviewed longer ago than the retention
 * window. Safe to run repeatedly — users with nothing left to clear are skipped.
 * @returns {Promise<{ users: Number, files: Number }>} What was removed
 */
const purgeExpiredKycDocuments = async () => {
  const retentionDays = config.kyc.retentionDays;
  if (!retentionDays || retentionDays <= 0) return { users: 0, files: 0 };

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const expired = await prisma.user.findMany({
    where: {
      sellerReviewedAt: { lt: cutoff },
      OR: KYC_COLUMNS.map((column) => ({ [column]: { not: null } })),
    },
    select: {
      id: true,
      idFrontUrl: true,
      idBackUrl: true,
      selfieUrl: true,
      sellerPermitUrl: true,
    },
  });

  let files = 0;
  for (const user of expired) {
    for (const column of KYC_COLUMNS) {
      if (removeStoredFile(user[column])) files += 1;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { idFrontUrl: null, idBackUrl: null, selfieUrl: null, sellerPermitUrl: null },
    });
  }

  if (expired.length > 0) {
    console.log(`[kyc-retention] cleared documents for ${expired.length} user(s), ${files} file(s) deleted`);
  }

  return { users: expired.length, files };
};

module.exports = { purgeExpiredKycDocuments };
