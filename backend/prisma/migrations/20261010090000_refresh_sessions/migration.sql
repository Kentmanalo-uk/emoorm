-- Refresh tokens become sessions the server remembers, so that signing out
-- ends one (and reusing a rotated token ends them all).
CREATE TABLE `refresh_sessions` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `family_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `replaced_by` VARCHAR(191) NULL,
  `user_agent` VARCHAR(300) NULL,
  `ip_address` VARCHAR(100) NULL,
  PRIMARY KEY (`id`),
  INDEX `refresh_sessions_user_idx` (`user_id`),
  INDEX `refresh_sessions_family_idx` (`family_id`),
  INDEX `refresh_sessions_expires_idx` (`expires_at`),
  CONSTRAINT `refresh_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
