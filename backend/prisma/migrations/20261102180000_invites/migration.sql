-- Invites (referrals). No real cash: a shop pays for its own invite rewards
-- with its own vouchers, and a seller who brings in another seller is paid in
-- visibility (a few days higher in For You), never money.
--
-- Expand only: every column is nullable or has a default, and the new tables
-- are read by nothing yet, so the version still live ignores all of it. The
-- whole feature is off (app_settings.referral_settings is null) until a super
-- admin turns it on.
--
--   users.referral_code          a person's own code, made when first asked for
--   users.referred_by_id         who invited them, set once
--   vouchers.owner_id            a voucher only one account may use
--   vouchers.referral_id         the invite it was given for
--   referrals                    one invite: who, through which shop, how far
--   shop_referral_programs       a shop's own invite rewards (off by default)
--   store_boosts                 a shop shown higher for a while
--   app_settings.referral_settings  the super admin's switches and limits

ALTER TABLE `app_settings`
  ADD COLUMN `referral_settings` JSON NULL;

ALTER TABLE `users`
  ADD COLUMN `referral_code` VARCHAR(16) NULL,
  ADD COLUMN `referred_by_id` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `users_referral_code_key` ON `users`(`referral_code`);
CREATE INDEX `users_referred_by_id_idx` ON `users`(`referred_by_id`);

ALTER TABLE `users`
  ADD CONSTRAINT `users_referred_by_id_fkey`
    FOREIGN KEY (`referred_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ── A voucher for one person ─────────────────────────────────────────────
-- An invite reward is a shop voucher only its owner can use. Deleting the
-- account deletes it: an ownerless reward would be anyone's.
ALTER TABLE `vouchers`
  ADD COLUMN `owner_id` VARCHAR(191) NULL,
  ADD COLUMN `referral_id` VARCHAR(191) NULL;

CREATE INDEX `vouchers_owner_id_idx` ON `vouchers`(`owner_id`);

ALTER TABLE `vouchers`
  ADD CONSTRAINT `vouchers_owner_id_fkey`
    FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ── One invite ───────────────────────────────────────────────────────────
-- BUYER: someone joined with a code (store_id: the shop whose link it was).
-- SELLER: someone the inviter brought in opened a shop (store_id: that shop).
CREATE TABLE `referrals` (
  `id`                 VARCHAR(191) NOT NULL,
  `kind`               ENUM('BUYER', 'SELLER') NOT NULL DEFAULT 'BUYER',
  `inviter_id`         VARCHAR(191) NOT NULL,
  `invitee_id`         VARCHAR(191) NOT NULL,
  `store_id`           VARCHAR(191) NULL,
  `status`             ENUM('PENDING', 'HELD', 'REWARDED', 'COUNTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `reason`             VARCHAR(40)  NULL,
  `order_id`           VARCHAR(191) NULL,
  `welcome_voucher_id` VARCHAR(191) NULL,
  `reward_voucher_id`  VARCHAR(191) NULL,
  `decided_by_id`      VARCHAR(191) NULL,
  `decided_at`         DATETIME(3)  NULL,
  `counted_at`         DATETIME(3)  NULL,
  `created_at`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`         DATETIME(3)  NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `referrals_invitee_id_kind_key` (`invitee_id`, `kind`),
  INDEX `referrals_inviter_id_status_counted_at_idx` (`inviter_id`, `status`, `counted_at`),
  INDEX `referrals_status_created_at_idx` (`status`, `created_at`),
  INDEX `referrals_store_id_idx` (`store_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `referrals`
  ADD CONSTRAINT `referrals_inviter_id_fkey`
    FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `referrals_invitee_id_fkey`
    FOREIGN KEY (`invitee_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `referrals_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `referrals_decided_by_id_fkey`
    FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ── A shop's invite rewards ──────────────────────────────────────────────
CREATE TABLE `shop_referral_programs` (
  `id`               VARCHAR(191) NOT NULL,
  `store_id`         VARCHAR(191) NOT NULL,
  `is_active`        BOOLEAN NOT NULL DEFAULT false,
  `welcome_type`     ENUM('PERCENT', 'FIXED') NOT NULL DEFAULT 'FIXED',
  `welcome_value`    DECIMAL(10, 2) NOT NULL DEFAULT 30,
  `reward_type`      ENUM('PERCENT', 'FIXED') NOT NULL DEFAULT 'FIXED',
  `reward_value`     DECIMAL(10, 2) NOT NULL DEFAULT 30,
  `max_discount`     DECIMAL(10, 2) NULL,
  `min_order_amount` DECIMAL(10, 2) NOT NULL DEFAULT 200,
  `monthly_cap`      INT NOT NULL DEFAULT 20,
  `created_at`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `shop_referral_programs_store_id_key` (`store_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `shop_referral_programs`
  ADD CONSTRAINT `shop_referral_programs_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ── A shop shown higher for a while ──────────────────────────────────────
CREATE TABLE `store_boosts` (
  `id`          VARCHAR(191) NOT NULL,
  `store_id`    VARCHAR(191) NOT NULL,
  `until`       DATETIME(3)  NOT NULL,
  `reason`      VARCHAR(40)  NOT NULL DEFAULT 'SELLER_INVITE',
  `referral_id` VARCHAR(191) NULL,
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `store_boosts_until_idx` (`until`),
  INDEX `store_boosts_store_id_until_idx` (`store_id`, `until`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `store_boosts`
  ADD CONSTRAINT `store_boosts_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
