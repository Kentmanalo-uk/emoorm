-- AlterTable: admin-facing notifications
ALTER TABLE `notifications` MODIFY `type` ENUM('ORDER_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_READY', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'PRODUCT_APPROVED', 'PRODUCT_SUSPENDED', 'SELLER_APPROVED', 'SELLER_SUSPENDED', 'REPORT_SUBMITTED', 'REPORT_RESOLVED', 'SYSTEM_ANNOUNCEMENT', 'STORE_NEW_PRODUCT', 'STORE_PROMOTION', 'STORE_ANNOUNCEMENT', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_AWAITING_SHIPMENT', 'RETURN_RECEIVED', 'RETURN_REFUNDED', 'RETURN_CANCELLED', 'RETURN_CLOSED', 'SUPPORT_MESSAGE', 'SELLER_APPLICATION_SUBMITTED', 'ADMIN_ALERT') NOT NULL,
    MODIFY `audience` ENUM('BUYER', 'SELLER', 'ADMIN') NOT NULL DEFAULT 'BUYER';

-- AlterTable: temporary (backup) municipal admins
ALTER TABLE `users` ADD COLUMN `admin_access_expires_at` DATETIME(3) NULL;

-- AlterTable: manual identity review
ALTER TABLE `identity_verifications` ADD COLUMN `reviewed_by_id` VARCHAR(191) NULL,
    ADD COLUMN `review_note` TEXT NULL;

-- AlterTable: municipality-scoped audit trail
ALTER TABLE `audit_logs` ADD COLUMN `municipality_id` VARCHAR(191) NULL;
CREATE INDEX `audit_logs_municipality_id_created_at_idx` ON `audit_logs`(`municipality_id`, `created_at`);

-- AlterTable: moderation reasons shown to sellers
ALTER TABLE `products` ADD COLUMN `moderation_note` TEXT NULL;
ALTER TABLE `stores` ADD COLUMN `suspension_reason` TEXT NULL;
