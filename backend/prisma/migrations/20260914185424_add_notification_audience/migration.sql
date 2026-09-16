-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `audience` ENUM('BUYER', 'SELLER') NOT NULL DEFAULT 'BUYER';
