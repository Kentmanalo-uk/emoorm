-- AlterTable
ALTER TABLE `reviews` ADD COLUMN `seller_reply` TEXT NULL,
    ADD COLUMN `seller_replied_at` DATETIME(3) NULL;
