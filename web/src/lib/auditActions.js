// Human-readable names for audit log action codes.
export const ACTION_LABELS = {
  APPROVE_SELLER: 'Approved seller',
  REJECT_SELLER: 'Rejected seller',
  SUSPEND_USER: 'Suspended user',
  ACTIVATE_USER: 'Activated user',
  SET_USER_ROLE: 'Changed user role',
  APPROVE_PRODUCT: 'Approved product',
  SUSPEND_PRODUCT: 'Suspended product',
  ARCHIVE_PRODUCT: 'Archived product',
  RESTORE_PRODUCT: 'Restored product',
  SUSPEND_STORE: 'Suspended store',
  UNSUSPEND_STORE: 'Unsuspended store',
  VERIFY_PAYMENT: 'Verified payment',
  REJECT_PAYMENT: 'Rejected payment',
  REPORT_RESOLVED: 'Resolved report',
  REPORT_DISMISSED: 'Dismissed report',
  REPORT_UNDER_REVIEW: 'Report under review',
  UPDATE_MUNICIPALITY_PAGE: 'Updated municipality page',
  BROADCAST_ANNOUNCEMENT: 'Broadcast announcement',
  ASSIGN_MUNICIPAL_ADMIN: 'Assigned municipal admin',
  ASSIGN_BACKUP_ADMIN: 'Assigned backup admin',
  REMOVE_MUNICIPAL_ADMIN: 'Removed municipal admin',
  BACKUP_ADMIN_EXPIRED: 'Backup admin expired',
  IDENTITY_VERIFICATION_ATTEMPT: 'Identity verification attempt',
  IDENTITY_VERIFICATION_REVOKED: 'Identity verification revoked',
  IDENTITY_MANUAL_VERIFY: 'Identity manually verified',
  IDENTITY_MANUAL_REJECT: 'Identity manually rejected',
};

export const actionLabel = (code = '') =>
  ACTION_LABELS[code] ||
  code.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
