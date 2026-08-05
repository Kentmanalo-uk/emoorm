const auditLogRepository = require('../repositories/auditLog.repository');

/**
 * Audit Log Service
 * Records administrative and moderation actions. Never throws.
 */

/**
 * Record an audit event. Errors are swallowed so audit failures never block business flow.
 * @param {Object} params
 * @param {Object|null} params.actor - req.user (id/email)
 * @param {String} params.action - e.g. 'APPROVE_SELLER', 'SUSPEND_PRODUCT'
 * @param {String} params.entity - e.g. 'User', 'Product', 'Report'
 * @param {String} [params.entityId]
 * @param {Object} [params.details]
 * @param {Object} [params.req] - optional Express req for IP/UA capture
 */
const record = async ({ actor, action, entity, entityId, details, req }) => {
  try {
    await auditLogRepository.create({
      userId: actor?.id || null,
      userEmail: actor?.email || null,
      action,
      entity,
      entityId: entityId || null,
      details: details || null,
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
      userAgent: req?.headers?.['user-agent'] || null,
    });
  } catch (err) {
    console.error('[auditLog] failed:', err.message);
  }
};

const list = async (options) => auditLogRepository.findAll(options);

module.exports = { record, list };
