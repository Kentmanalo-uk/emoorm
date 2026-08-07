-- AlterTable
ALTER TABLE `orders` ADD COLUMN `buyer_barangay` VARCHAR(191) NULL,
    ADD COLUMN `buyer_municipality_id` VARCHAR(191) NULL,
    ADD COLUMN `fulfillment_method` ENUM('DELIVERY', 'PICKUP') NOT NULL DEFAULT 'DELIVERY',
    ADD COLUMN `payment_method` ENUM('COD', 'GCASH', 'QRPH', 'BANK_TRANSFER') NOT NULL DEFAULT 'COD',
    ADD COLUMN `payment_proof_url` VARCHAR(191) NULL,
    ADD COLUMN `payment_reference` VARCHAR(191) NULL,
    ADD COLUMN `pickup_location` TEXT NULL,
    MODIFY `status` ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `stores` ADD COLUMN `accepts_cod` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `fulfillment_mode` ENUM('DELIVERY', 'PICKUP', 'BOTH') NOT NULL DEFAULT 'DELIVERY',
    ADD COLUMN `payment_instructions` TEXT NULL,
    ADD COLUMN `payment_qr_image` VARCHAR(191) NULL,
    ADD COLUMN `payment_qr_type` VARCHAR(191) NULL,
    ADD COLUMN `pickup_address` TEXT NULL,
    ADD COLUMN `pickup_instructions` TEXT NULL;

-- CreateTable
CREATE TABLE `store_service_areas` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `municipality_id` VARCHAR(191) NOT NULL,
    `barangay` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `store_service_areas_store_id_idx`(`store_id`),
    INDEX `store_service_areas_municipality_id_idx`(`municipality_id`),
    UNIQUE INDEX `store_service_areas_store_id_municipality_id_barangay_key`(`store_id`, `municipality_id`, `barangay`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `store_service_areas` ADD CONSTRAINT `store_service_areas_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_service_areas` ADD CONSTRAINT `store_service_areas_municipality_id_fkey` FOREIGN KEY (`municipality_id`) REFERENCES `municipalities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
