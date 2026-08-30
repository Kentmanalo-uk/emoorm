-- AlterTable
ALTER TABLE `messages` ADD COLUMN `product_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
