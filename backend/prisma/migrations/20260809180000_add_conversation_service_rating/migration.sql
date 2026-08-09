-- AlterTable
ALTER TABLE `conversations` ADD COLUMN `service_rating` INTEGER NULL,
    ADD COLUMN `service_rating_at` DATETIME(3) NULL;
