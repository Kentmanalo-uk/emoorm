-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('ORDER_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_READY', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'PRODUCT_APPROVED', 'PRODUCT_SUSPENDED', 'SELLER_APPROVED', 'SELLER_SUSPENDED', 'REPORT_SUBMITTED', 'REPORT_RESOLVED', 'SYSTEM_ANNOUNCEMENT', 'STORE_NEW_PRODUCT', 'STORE_PROMOTION', 'STORE_ANNOUNCEMENT', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_AWAITING_SHIPMENT', 'RETURN_RECEIVED', 'RETURN_REFUNDED', 'RETURN_CANCELLED', 'RETURN_CLOSED', 'SUPPORT_MESSAGE') NOT NULL;

-- CreateTable
CREATE TABLE `support_conversations` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `municipality_id` VARCHAR(191) NOT NULL,
    `topic` VARCHAR(191) NOT NULL DEFAULT 'GENERAL',
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `last_message_at` DATETIME(3) NULL,
    `user_last_read_at` DATETIME(3) NULL,
    `admin_last_read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `support_conversations_municipality_id_last_message_at_idx`(`municipality_id`, `last_message_at`),
    UNIQUE INDEX `support_conversations_user_id_municipality_id_key`(`user_id`, `municipality_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_messages` (
    `id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NOT NULL,
    `sender_id` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_messages_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `support_conversations` ADD CONSTRAINT `support_conversations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_conversations` ADD CONSTRAINT `support_conversations_municipality_id_fkey` FOREIGN KEY (`municipality_id`) REFERENCES `municipalities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `support_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_messages` ADD CONSTRAINT `support_messages_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
