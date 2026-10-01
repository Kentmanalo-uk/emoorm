-- Couriers: sellers ship with J&T, LBC and others, scan the waybill's
-- tracking number, and the order becomes SHIPPED; buyers track it.

-- A new order status, in both places it is stored.
ALTER TABLE `orders`
  MODIFY `status` ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP', 'SHIPPED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `courier_id` VARCHAR(191) NULL,
  ADD COLUMN `courier_name` VARCHAR(80) NULL,
  ADD COLUMN `tracking_number` VARCHAR(60) NULL,
  ADD COLUMN `shipped_at` DATETIME(3) NULL;

ALTER TABLE `order_status_history`
  MODIFY `from_status` ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP', 'SHIPPED') NULL,
  MODIFY `to_status` ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP', 'SHIPPED') NOT NULL;

-- Shops keep delivering themselves unless they turn it off.
ALTER TABLE `stores` ADD COLUMN `self_delivery` BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE `couriers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `logo_url` VARCHAR(191) NULL,
    `tracking_url` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `couriers_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `store_couriers` (
    `store_id` VARCHAR(191) NOT NULL,
    `courier_id` VARCHAR(191) NOT NULL,

    INDEX `store_couriers_courier_idx`(`courier_id`),
    PRIMARY KEY (`store_id`, `courier_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `orders` ADD CONSTRAINT `orders_courier_id_fkey` FOREIGN KEY (`courier_id`) REFERENCES `couriers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `store_couriers` ADD CONSTRAINT `store_couriers_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `store_couriers` ADD CONSTRAINT `store_couriers_courier_id_fkey` FOREIGN KEY (`courier_id`) REFERENCES `couriers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Couriers that serve Oriental Mindoro. Tracking links are left for the
-- super admin to add; until then buyers get a general parcel tracker.
INSERT INTO `couriers` (`id`, `name`, `sort_order`, `created_at`, `updated_at`) VALUES
  (UUID(), 'J&T Express', 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (UUID(), 'LBC', 2, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (UUID(), 'Flash Express', 3, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (UUID(), 'JRS Express', 4, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (UUID(), '2GO Express', 5, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  (UUID(), 'Ninja Van', 6, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));
