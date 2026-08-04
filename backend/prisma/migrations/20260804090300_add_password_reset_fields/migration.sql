-- AlterTable
ALTER TABLE `users` ADD COLUMN `password_reset_expiry` DATETIME(3) NULL,
    ADD COLUMN `password_reset_token` VARCHAR(191) NULL;
