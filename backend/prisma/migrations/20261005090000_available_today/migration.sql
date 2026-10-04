-- AlterTable
ALTER TABLE `app_settings` ADD COLUMN `available_today_enabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `products` ADD COLUMN `listing_kind` ENUM('REGULAR', 'TODAY') NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `respond_by` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `order_items` ADD COLUMN `availability_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `product_availabilities` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `mode` ENUM('READY_NOW', 'MADE_TO_ORDER', 'PRE_ORDER') NOT NULL DEFAULT 'READY_NOW',
    `quantity` INTEGER NOT NULL,
    `sold_count` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `orders_open_at` DATETIME(3) NOT NULL,
    `orders_close_at` DATETIME(3) NOT NULL,
    `ready_from` DATETIME(3) NOT NULL,
    `ready_until` DATETIME(3) NOT NULL,
    `prep_minutes` INTEGER NULL,
    `fulfillment` ENUM('DELIVERY', 'PICKUP', 'BOTH') NOT NULL DEFAULT 'BOTH',
    `note` VARCHAR(200) NULL,
    `ended_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `availability_status_close_idx`(`status`, `orders_close_at`),
    INDEX `availability_status_open_idx`(`status`, `orders_open_at`),
    INDEX `availability_product_idx`(`product_id`, `status`),
    INDEX `availability_store_idx`(`store_id`, `ready_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_availabilities` ADD CONSTRAINT `product_availabilities_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_availabilities` ADD CONSTRAINT `product_availabilities_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_availability_id_fkey` FOREIGN KEY (`availability_id`) REFERENCES `product_availabilities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
