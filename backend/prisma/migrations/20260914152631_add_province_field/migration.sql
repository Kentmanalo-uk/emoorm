-- AlterTable
ALTER TABLE `addresses` ADD COLUMN `province` VARCHAR(191) NULL DEFAULT 'Oriental Mindoro';

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `buyer_province` VARCHAR(191) NULL DEFAULT 'Oriental Mindoro';

-- AlterTable
ALTER TABLE `stores` ADD COLUMN `province` VARCHAR(191) NULL DEFAULT 'Oriental Mindoro';

-- AlterTable
ALTER TABLE `users` ADD COLUMN `province` VARCHAR(191) NULL DEFAULT 'Oriental Mindoro';
