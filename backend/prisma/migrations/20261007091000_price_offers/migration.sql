-- Price offers on livestock: a buyer's price per head, the seller's answer.
ALTER TABLE `products` ADD COLUMN `accepts_offers` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `offer_floor` DECIMAL(10, 2) NULL;

ALTER TABLE `order_items` ADD COLUMN `offer_id` VARCHAR(191) NULL;

ALTER TABLE `messages` ADD COLUMN `offer_id` VARCHAR(191) NULL;

CREATE TABLE `price_offers` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `buyer_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `list_price` DECIMAL(10, 2) NOT NULL,
    `offer_price` DECIMAL(10, 2) NOT NULL,
    `counter_price` DECIMAL(10, 2) NULL,
    `agreed_price` DECIMAL(10, 2) NULL,
    `note` VARCHAR(300) NULL,
    `seller_note` VARCHAR(300) NULL,
    `status` ENUM('PENDING', 'COUNTERED', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'USED') NOT NULL DEFAULT 'PENDING',
    `respond_by` DATETIME(3) NOT NULL,
    `buy_by` DATETIME(3) NULL,
    `order_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `price_offers_product_buyer_idx`(`product_id`, `buyer_id`, `status`),
    INDEX `price_offers_store_idx`(`store_id`, `status`, `created_at`),
    INDEX `price_offers_buyer_idx`(`buyer_id`, `status`, `created_at`),
    INDEX `price_offers_due_idx`(`status`, `respond_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `messages` ADD CONSTRAINT `messages_offer_id_fkey` FOREIGN KEY (`offer_id`) REFERENCES `price_offers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `price_offers` ADD CONSTRAINT `price_offers_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `price_offers` ADD CONSTRAINT `price_offers_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `price_offers` ADD CONSTRAINT `price_offers_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
