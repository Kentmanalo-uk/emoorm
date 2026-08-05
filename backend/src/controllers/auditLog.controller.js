const auditLogService = require('../services/auditLog.service');
const { paginatedResponse } = require('../utils/response');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Audit Log Controller
 * SUPER_ADMIN read-only view of audit trail
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
  } = req.query;

  const result = await auditLogService.list({
    page: parseInt(page),
    pageSize: parseInt(pageSize),
    userId,
    action,
    entity,
    entityId,
    from,
    to,
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
