-- MoorMove riders (move.emoorm.shop) can deliver orders: a buyer picks a
-- rider at checkout, the seller calls one once the order is packed, and
-- MoorMove keeps the order up to date as the rider picks it up and delivers.
-- A super admin switches it on for everyone; each shop may switch it off.

ALTER TABLE `app_settings` ADD COLUMN `moormove_enabled` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `stores` ADD COLUMN `moormove_enabled` BOOLEAN NOT NULL DEFAULT true;

-- 'MOORMOVE' when the buyer chose a rider.
ALTER TABLE `orders` ADD COLUMN `delivery_partner` VARCHAR(20) NULL;

-- One row per MoorMove job (a rider booking); an order's current one is its newest.
CREATE TABLE `rider_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(64) NOT NULL,
    `job_code` VARCHAR(16) NULL,
    `status` VARCHAR(20) NOT NULL,
    `rider_name` VARCHAR(120) NULL,
    `rider_phone` VARCHAR(30) NULL,
    `rider_vehicle` VARCHAR(20) NULL,
    `rider_plate` VARCHAR(20) NULL,
    `rider_lat` DOUBLE NULL,
    `rider_lng` DOUBLE NULL,
    `rider_seen_at` DATETIME(3) NULL,
    `fee` DECIMAL(10, 2) NOT NULL,
    `cod_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `fee_paid_by` VARCHAR(12) NOT NULL,
    `accepted_at` DATETIME(3) NULL,
    `picked_up_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,
    `cod_collected_at` DATETIME(3) NULL,
    `cod_returned_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(255) NULL,
    `fail_reason` VARCHAR(255) NULL,
    `last_event_id` VARCHAR(64) NULL,
    `job_updated_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `rider_deliveries_job_id_key`(`job_id`),
    INDEX `rider_deliveries_order_idx`(`order_id`, `created_at`),
    INDEX `rider_deliveries_status_idx`(`status`, `updated_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `rider_deliveries_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- MoorMove updates already applied (by id), so a repeat is applied once.
-- Kept for 7 days.
CREATE TABLE `moormove_events` (
    `id` VARCHAR(64) NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `moormove_events_received_idx`(`received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
