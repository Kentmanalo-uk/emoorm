-- Consolidate the support system and add super-admin <-> municipal-admin messaging.
--
-- Three things happen here, in order:
--   1. support_conversations becomes a case: it gains a category, a subject,
--      a resolution and a rating, and loses the unique constraint that let a
--      person hold only one thread for life.
--   2. the two write-only support_tickets rows are carried into that table as
--      real cases with their text as the first message, then the table goes.
--   3. admin_conversations / admin_messages are created.

-- ── 1. support_conversations becomes a support case ────────────────────────

-- The replacement indexes come first: MySQL keeps the foreign keys on
-- user_id and municipality_id backed by whichever index leads with that
-- column, and refuses to drop the last one standing.
CREATE INDEX `support_conversations_municipality_id_status_last_message_at_idx`
    ON `support_conversations`(`municipality_id`, `status`, `last_message_at`);
CREATE INDEX `support_conversations_user_id_last_message_at_idx`
    ON `support_conversations`(`user_id`, `last_message_at`);

-- The old constraint meant opening a support case silently rewrote the
-- admin's direct message to the same person. A person may now hold several.
DROP INDEX `support_conversations_user_id_municipality_id_key` ON `support_conversations`;
DROP INDEX `support_conversations_municipality_id_last_message_at_idx` ON `support_conversations`;

ALTER TABLE `support_conversations`
  ADD COLUMN `category` ENUM(
    'ORDER','PAYMENT','DELIVERY','RETURN','ACCOUNT','SELLER',
    'IDENTITY_VERIFICATION','APP_EXPERIENCE','FEATURE_REQUEST','OTHER'
  ) NOT NULL DEFAULT 'OTHER',
  ADD COLUMN `subject` VARCHAR(160) NULL,
  ADD COLUMN `resolved_at` DATETIME(3) NULL,
  ADD COLUMN `resolved_by_id` VARCHAR(191) NULL,
  ADD COLUMN `rating` INTEGER NULL,
  ADD COLUMN `rating_comment` TEXT NULL,
  ADD COLUMN `rated_at` DATETIME(3) NULL,
  MODIFY `status` ENUM('OPEN','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN';

-- Existing identity-verification threads already know their category.
UPDATE `support_conversations`
   SET `category` = 'IDENTITY_VERIFICATION'
 WHERE `topic` = 'IDENTITY_VERIFICATION';

-- ── 2. carry the old tickets across, then drop the table ───────────────────

-- Each ticket becomes an open case in the submitter's own municipality,
-- keeping its subject, category and timestamps.
INSERT INTO `support_conversations`
  (`id`, `user_id`, `municipality_id`, `topic`, `category`, `subject`,
   `status`, `last_message_at`, `user_last_read_at`, `created_at`, `updated_at`)
SELECT
  t.`id`,
  t.`user_id`,
  u.`municipality_id`,
  'GENERAL',
  CASE t.`category`
    WHEN 'ORDER'    THEN 'ORDER'
    WHEN 'PAYMENT'  THEN 'PAYMENT'
    WHEN 'DELIVERY' THEN 'DELIVERY'
    WHEN 'RETURN'   THEN 'RETURN'
    WHEN 'ACCOUNT'  THEN 'ACCOUNT'
    WHEN 'SELLER'   THEN 'SELLER'
    WHEN 'APP_EXPERIENCE'  THEN 'APP_EXPERIENCE'
    WHEN 'FEATURE_REQUEST' THEN 'FEATURE_REQUEST'
    ELSE 'OTHER'
  END,
  LEFT(t.`subject`, 160),
  'OPEN',
  t.`created_at`,
  t.`created_at`,
  t.`created_at`,
  t.`updated_at`
FROM `support_tickets` t
JOIN `users` u ON u.`id` = t.`user_id`
WHERE u.`municipality_id` IS NOT NULL;

-- The ticket body becomes the opening message of that case, from its author.
INSERT INTO `support_messages` (`id`, `conversation_id`, `sender_id`, `body`, `created_at`)
SELECT UUID(), t.`id`, t.`user_id`, t.`message`, t.`created_at`
FROM `support_tickets` t
JOIN `support_conversations` c ON c.`id` = t.`id`;

-- A rating on an old feedback ticket belongs to the case it came from.
UPDATE `support_conversations` c
  JOIN `support_tickets` t ON t.`id` = c.`id`
   SET c.`rating` = t.`rating`, c.`rated_at` = t.`created_at`
 WHERE t.`rating` IS NOT NULL;

DROP TABLE `support_tickets`;

-- ── 3. super admin <-> municipal admin messaging ───────────────────────────

CREATE TABLE `admin_conversations` (
  `id` VARCHAR(191) NOT NULL,
  `admin_id` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(160) NOT NULL,
  `status` ENUM('OPEN','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  `last_message_at` DATETIME(3) NULL,
  `admin_last_read_at` DATETIME(3) NULL,
  `super_last_read_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `admin_conversations_admin_id_last_message_at_idx`(`admin_id`, `last_message_at`),
  INDEX `admin_conversations_status_last_message_at_idx`(`status`, `last_message_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_messages` (
  `id` VARCHAR(191) NOT NULL,
  `conversation_id` VARCHAR(191) NOT NULL,
  `sender_id` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `admin_messages_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `admin_conversations`
  ADD CONSTRAINT `admin_conversations_admin_id_fkey`
  FOREIGN KEY (`admin_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `admin_messages`
  ADD CONSTRAINT `admin_messages_conversation_id_fkey`
  FOREIGN KEY (`conversation_id`) REFERENCES `admin_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `admin_messages`
  ADD CONSTRAINT `admin_messages_sender_id_fkey`
  FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. reports: a real seller relation, a decider, and indexes ─────────────

ALTER TABLE `reports`
  ADD COLUMN `resolved_by_id` VARCHAR(191) NULL;

-- reported_seller_id held a bare uuid, so a seller report reached the admin
-- with no name, store or municipality attached.
ALTER TABLE `reports`
  ADD CONSTRAINT `reports_reported_seller_id_fkey`
  FOREIGN KEY (`reported_seller_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `reports_municipality_idx` ON `reports`(`municipality_id`, `status`, `created_at`);
CREATE INDEX `reports_status_idx` ON `reports`(`status`, `created_at`);
CREATE INDEX `reports_reporter_idx` ON `reports`(`reporter_id`, `created_at`);
CREATE INDEX `reports_seller_idx` ON `reports`(`reported_seller_id`);

-- ── 5. new notification kinds ─────────────────────────────────────────────

ALTER TABLE `notifications`
  MODIFY `type` ENUM(
    'ORDER_RECEIVED','ORDER_CONFIRMED','ORDER_READY','ORDER_COMPLETED','ORDER_CANCELLED',
    'PRODUCT_APPROVED','PRODUCT_SUSPENDED','SELLER_APPROVED','SELLER_SUSPENDED',
    'REPORT_SUBMITTED','REPORT_RESOLVED','SYSTEM_ANNOUNCEMENT',
    'STORE_NEW_PRODUCT','STORE_PROMOTION','STORE_ANNOUNCEMENT',
    'RETURN_REQUESTED','RETURN_APPROVED','RETURN_REJECTED','RETURN_AWAITING_SHIPMENT',
    'RETURN_RECEIVED','RETURN_REFUNDED','RETURN_CANCELLED','RETURN_CLOSED',
    'SUPPORT_MESSAGE','SUPPORT_RESOLVED','ADMIN_MESSAGE','STORE_MESSAGE',
    'SELLER_APPLICATION_SUBMITTED','ADMIN_ALERT'
  ) NOT NULL;
