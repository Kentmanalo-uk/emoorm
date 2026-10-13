-- A failed MoorMove trip that was the buyer's fault: the rider is paid and the
-- buyer pays the delivery fee. rider_deliveries keeps MoorMove's reason code
-- and whether it was the buyer's fault; on cash on delivery the fee the shop
-- paid the rider becomes a buyer_unpaid_fees row, collected on the buyer's next
-- order from that shop (or the failed order itself when it goes out again):
-- that order's total includes it as failed_trip_fees.

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `failed_trip_fees` DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `rider_deliveries` ADD COLUMN `buyer_fault` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `fail_code` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `buyer_unpaid_fees` (
    `id` VARCHAR(191) NOT NULL,
    `buyer_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(64) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `status` ENUM('OPEN', 'PAID', 'WAIVED') NOT NULL DEFAULT 'OPEN',
    `paid_order_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paid_at` DATETIME(3) NULL,
    `waived_by_id` VARCHAR(64) NULL,
    `waived_at` DATETIME(3) NULL,

    UNIQUE INDEX `buyer_unpaid_fees_job_key`(`job_id`),
    INDEX `buyer_unpaid_fees_buyer_idx`(`buyer_id`, `store_id`, `status`),
    INDEX `buyer_unpaid_fees_order_idx`(`order_id`),
    INDEX `buyer_unpaid_fees_paid_order_idx`(`paid_order_id`),
    INDEX `buyer_unpaid_fees_store_idx`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `buyer_unpaid_fees` ADD CONSTRAINT `buyer_unpaid_fees_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `buyer_unpaid_fees` ADD CONSTRAINT `buyer_unpaid_fees_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `buyer_unpaid_fees` ADD CONSTRAINT `buyer_unpaid_fees_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `buyer_unpaid_fees` ADD CONSTRAINT `buyer_unpaid_fees_paid_order_id_fkey` FOREIGN KEY (`paid_order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

