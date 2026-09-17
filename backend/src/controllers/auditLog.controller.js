const auditLogService = require('../services/auditLog.service');
const { paginatedResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Audit Log Controller
 * Read-only audit trail: superadmins see everything, municipal admins only
 * actions recorded for their municipality.
 */

const getAuditLogs = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 25,
    userId,
    action,
    entity,
    entityId,
    from,
    to,
    municipalityId,
  } = req.query;

  const result = await auditLogService.list({
    page: Math.max(1, parseInt(page, 10) || 1),
    pageSize: Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25)),
    userId,
    action,
    entity,
    entityId,
    from,
    to,
    municipalityId: req.user.role === 'MUNICIPAL_ADMIN' ? req.user.municipalityId : municipalityId,
  });

  paginatedResponse(
    res,
    result.logs,
    result.total,
    result.page,
    result.pageSize,
    'Audit logs retrieved successfully'
  );
});

module.exports = { getAuditLogs };
