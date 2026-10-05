-- Product kinds (regular, ready to eat, paluto, live animal, package), each
-- with its own facts in `details`; packages list the shop's products they
-- hold; categories say which kinds their sellers are asked about.

-- AlterTable
ALTER TABLE `categories` ADD COLUMN `kind` ENUM('GOODS', 'FOOD', 'LIVESTOCK') NOT NULL DEFAULT 'GOODS';

-- AlterTable
ALTER TABLE `products` ADD COLUMN `details` JSON NULL,
    ADD COLUMN `fulfillment` ENUM('DELIVERY', 'PICKUP', 'BOTH') NULL,
    ADD COLUMN `product_type` ENUM('REGULAR', 'READY_TO_EAT', 'COOK_TO_ORDER', 'LIVESTOCK', 'PACKAGE') NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE `order_items` ADD COLUMN `package_contents` JSON NULL;

-- CreateTable
CREATE TABLE `package_items` (
    `id` VARCHAR(191) NOT NULL,
    `package_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `package_items_product_idx`(`product_id`),
    UNIQUE INDEX `package_items_package_id_product_id_key`(`package_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `package_items` ADD CONSTRAINT `package_items_package_id_fkey` FOREIGN KEY (`package_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `package_items` ADD CONSTRAINT `package_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Available Today products are ready-to-eat food.
UPDATE `products` SET `product_type` = 'READY_TO_EAT' WHERE `listing_kind` = 'TODAY';

-- Starting kinds; a super admin can change them.
UPDATE `categories` SET `kind` = 'LIVESTOCK' WHERE `slug` = 'livestock';
UPDATE `categories` SET `kind` = 'FOOD' WHERE `slug` IN ('local-delicacies', 'processed-foods');
