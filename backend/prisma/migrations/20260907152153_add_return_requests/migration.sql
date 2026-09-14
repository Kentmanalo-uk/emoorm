-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('ORDER_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_READY', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'PRODUCT_APPROVED', 'PRODUCT_SUSPENDED', 'SELLER_APPROVED', 'SELLER_SUSPENDED', 'REPORT_SUBMITTED', 'REPORT_RESOLVED', 'SYSTEM_ANNOUNCEMENT', 'STORE_NEW_PRODUCT', 'STORE_PROMOTION', 'STORE_ANNOUNCEMENT', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_AWAITING_SHIPMENT', 'RETURN_RECEIVED', 'RETURN_REFUNDED', 'RETURN_CANCELLED', 'RETURN_CLOSED') NOT NULL;

-- CreateTable
CREATE TABLE `return_requests` (
    `id` VARCHAR(191) NOT NULL,
    `request_number` VARCHAR(191) NOT NULL,
    `order_id` VARCHAR(191) NOT NULL,
    `buyer_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'AWAITING_SHIPMENT', 'RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED', 'CLOSED') NOT NULL DEFAULT 'REQUESTED',
    `reason` ENUM('DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'MISSING', 'OTHER') NOT NULL,
    `buyer_note` TEXT NULL,
    `seller_note` TEXT NULL,
    `photos` JSON NULL,
    `requested_amount` DECIMAL(10, 2) NOT NULL,
    `approved_amount` DECIMAL(10, 2) NULL,
    `refunded_amount` DECIMAL(10, 2) NULL,
    `refund_method` ENUM('COD_CASH', 'GCASH', 'BANK', 'MANUAL') NULL,
    `refund_reference` VARCHAR(191) NULL,
    `requires_physical_return` BOOLEAN NOT NULL DEFAULT true,
    `return_policy_snapshot` JSON NULL,
    `history` JSON NULL,
    `decided_at` DATETIME(3) NULL,
    `decided_by` VARCHAR(191) NULL,
    `received_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `return_requests_request_number_key`(`request_number`),
    INDEX `return_requests_order_id_idx`(`order_id`),
    INDEX `return_requests_buyer_id_idx`(`buyer_id`),
    INDEX `return_requests_store_id_status_idx`(`store_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `return_request_items` (
    `id` VARCHAR(191) NOT NULL,
    `return_request_id` VARCHAR(191) NOT NULL,
    `order_item_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `restock_on_receive` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `return_request_items_order_item_id_idx`(`order_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `return_requests` ADD CONSTRAINT `return_requests_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `return_requests` ADD CONSTRAINT `return_requests_buyer_id_fkey` FOREIGN KEY (`buyer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `return_requests` ADD CONSTRAINT `return_requests_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `return_request_items` ADD CONSTRAINT `return_request_items_return_request_id_fkey` FOREIGN KEY (`return_request_id`) REFERENCES `return_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `return_request_items` ADD CONSTRAINT `return_request_items_order_item_id_fkey` FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
