-- Account deletion on request, SMS-verified numbers, shop vacation and hours,
-- ready-by estimates, sale prices and bulk prices, shop vouchers, return
-- disputes, address map pins, cancellation reasons (buyer reliability),
-- product questions and product view counts.

-- Accounts: closed at the owner's request, erased 30 days later.
ALTER TABLE `users`
  ADD COLUMN `deletion_requested_at` DATETIME(3) NULL,
  ADD COLUMN `phone_verified_at` DATETIME(3) NULL,
  ADD COLUMN `phone_verified_number` VARCHAR(20) NULL;

-- Shops: away until a date, weekly hours, days to prepare an order.
ALTER TABLE `stores`
  ADD COLUMN `vacation_until` DATETIME(3) NULL,
  ADD COLUMN `vacation_note` VARCHAR(200) NULL,
  ADD COLUMN `opening_hours` JSON NULL,
  ADD COLUMN `prep_days` INTEGER NULL;

-- Products: a sale price for a time, and lower prices for larger quantities.
ALTER TABLE `products`
  ADD COLUMN `sale_price` DECIMAL(10, 2) NULL,
  ADD COLUMN `sale_starts_at` DATETIME(3) NULL,
  ADD COLUMN `sale_ends_at` DATETIME(3) NULL,
  ADD COLUMN `price_tiers` JSON NULL;

-- Orders: why and by whom an order was cancelled, and when it should arrive.
ALTER TABLE `orders`
  ADD COLUMN `cancel_reason` VARCHAR(40) NULL,
  ADD COLUMN `cancelled_by` VARCHAR(10) NULL,
  ADD COLUMN `eta_from` DATETIME(3) NULL,
  ADD COLUMN `eta_to` DATETIME(3) NULL;
CREATE INDEX `orders_buyer_cancel_idx` ON `orders`(`buyer_id`, `cancel_reason`);

-- Addresses: an optional pin for the rider.
ALTER TABLE `addresses`
  ADD COLUMN `latitude` DOUBLE NULL,
  ADD COLUMN `longitude` DOUBLE NULL;

-- Vouchers: a shop's own, valid only on its orders. Empty = platform voucher.
ALTER TABLE `vouchers`
  ADD COLUMN `store_id` VARCHAR(191) NULL;
CREATE INDEX `vouchers_store_idx` ON `vouchers`(`store_id`, `is_active`);
ALTER TABLE `vouchers`
  ADD CONSTRAINT `vouchers_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Returns: a rejected return the buyer takes to the municipal admin.
ALTER TABLE `return_requests`
  MODIFY `status` ENUM('REQUESTED', 'APPROVED', 'AWAITING_SHIPMENT', 'RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED', 'CLOSED', 'DISPUTED') NOT NULL DEFAULT 'REQUESTED',
  ADD COLUMN `dispute_reason` TEXT NULL,
  ADD COLUMN `disputed_at` DATETIME(3) NULL,
  ADD COLUMN `dispute_resolution` TEXT NULL,
  ADD COLUMN `dispute_resolved_at` DATETIME(3) NULL,
  ADD COLUMN `dispute_resolved_by` VARCHAR(191) NULL;

ALTER TABLE `notifications`
  MODIFY `type` ENUM('ORDER_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_READY', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'PRODUCT_APPROVED', 'PRODUCT_SUSPENDED', 'SELLER_APPROVED', 'SELLER_SUSPENDED', 'REPORT_SUBMITTED', 'REPORT_RESOLVED', 'SYSTEM_ANNOUNCEMENT', 'STORE_NEW_PRODUCT', 'STORE_PROMOTION', 'STORE_ANNOUNCEMENT', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_AWAITING_SHIPMENT', 'RETURN_RECEIVED', 'RETURN_REFUNDED', 'RETURN_CANCELLED', 'RETURN_CLOSED', 'SUPPORT_MESSAGE', 'SUPPORT_RESOLVED', 'ADMIN_MESSAGE', 'STORE_MESSAGE', 'SELLER_APPLICATION_SUBMITTED', 'ADMIN_ALERT', 'LOW_STOCK', 'PRICE_DROP', 'PRODUCT_QUESTION', 'PRODUCT_ANSWER', 'RETURN_DISPUTED', 'RETURN_DISPUTE_RESOLVED') NOT NULL;

-- Questions buyers ask on a product page, answered by the shop.
CREATE TABLE `product_questions` (
    `id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `asker_id` VARCHAR(191) NOT NULL,
    `question` TEXT NOT NULL,
    `answer` TEXT NULL,
    `answered_at` DATETIME(3) NULL,
    `is_hidden` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `product_questions_product_idx`(`product_id`, `is_hidden`, `created_at`),
    INDEX `product_questions_store_idx`(`store_id`, `answered_at`),
    INDEX `product_questions_asker_idx`(`asker_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `product_questions` ADD CONSTRAINT `product_questions_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_questions` ADD CONSTRAINT `product_questions_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `product_questions` ADD CONSTRAINT `product_questions_asker_id_fkey` FOREIGN KEY (`asker_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Product page views per day (Manila date), for the seller's analytics.
CREATE TABLE `product_views` (
    `product_id` VARCHAR(191) NOT NULL,
    `day` DATE NOT NULL,
    `views` INTEGER NOT NULL DEFAULT 0,

    INDEX `product_views_day_idx`(`day`),
    PRIMARY KEY (`product_id`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `product_views` ADD CONSTRAINT `product_views_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
