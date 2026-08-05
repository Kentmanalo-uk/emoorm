-- AlterTable
ALTER TABLE `users` ADD COLUMN `mfa_backup_codes` TEXT NULL,
    ADD COLUMN `mfa_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mfa_enabled_at` DATETIME(3) NULL,
    ADD COLUMN `mfa_last_verified_at` DATETIME(3) NULL,
    ADD COLUMN `mfa_secret` TEXT NULL;
