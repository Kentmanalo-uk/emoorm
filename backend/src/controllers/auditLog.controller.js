const auditLogService = require('../services/auditLog.service');
const { maskIp } = require('../utils/privacy');
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

  // Where a request came from is not an admin's business: municipal admins
  // get neither the IP nor the browser; the super admin, the network part
  // of the IP and the browser's name.
  const isSuper = req.user.role === 'SUPER_ADMIN';
  const logs = result.logs.map(({ ipAddress, userAgent, ...log }) => (isSuper
    ? { ...log, ipAddress: maskIp(ipAddress), userAgent: briefAgent(userAgent) }
    : log));

  paginatedResponse(
    res,
    logs,
    result.total,
    result.page,
    result.pageSize,
    'Audit logs retrieved successfully'
  );
});

/** "Mozilla/5.0 (Linux; Android 14…) … Chrome/131…" → "Chrome on Android" */
function briefAgent(ua) {
  const text = String(ua || '');
  if (!text) return null;
  const browser = /Edg\//.test(text) ? 'Edge' : /OPR\//.test(text) ? 'Opera' : /Chrome\//.test(text) ? 'Chrome'
    : /Firefox\//.test(text) ? 'Firefox' : /Safari\//.test(text) ? 'Safari' : 'Browser';
  const os = /Android/.test(text) ? 'Android' : /iPhone|iPad/.test(text) ? 'iOS' : /Windows/.test(text) ? 'Windows'
    : /Mac OS X/.test(text) ? 'macOS' : /Linux/.test(text) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

module.exports = { getAuditLogs };
