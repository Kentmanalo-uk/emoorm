-- AlterTable
ALTER TABLE `users` ADD COLUMN `id_back_url` VARCHAR(191) NULL,
    ADD COLUMN `id_front_url` VARCHAR(191) NULL,
    ADD COLUMN `id_type` VARCHAR(191) NULL,
    ADD COLUMN `selfie_url` VARCHAR(191) NULL,
    ADD COLUMN `shop_address` VARCHAR(191) NULL,
    ADD COLUMN `shop_description` TEXT NULL,
    ADD COLUMN `shop_name` VARCHAR(191) NULL;
