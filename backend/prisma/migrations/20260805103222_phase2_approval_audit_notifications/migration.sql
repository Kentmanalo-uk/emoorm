-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD COLUMN `related_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `products` ADD COLUMN `approved_at` DATETIME(3) NULL,
    ADD COLUMN `approved_by_id` VARCHAR(191) NULL;
