-- CreateTable
CREATE TABLE `team_messages` (
    `id` VARCHAR(191) NOT NULL,
    `municipality_id` VARCHAR(191) NOT NULL,
    `sender_id` VARCHAR(191) NOT NULL,
    `recipient_id` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `team_messages_thread_idx`(`municipality_id`, `recipient_id`, `created_at`),
    INDEX `team_messages_pair_idx`(`sender_id`, `recipient_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_chat_reads` (
    `user_id` VARCHAR(191) NOT NULL,
    `thread` VARCHAR(64) NOT NULL,
    `last_read_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`, `thread`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `team_messages` ADD CONSTRAINT `team_messages_municipality_id_fkey` FOREIGN KEY (`municipality_id`) REFERENCES `municipalities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_messages` ADD CONSTRAINT `team_messages_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_messages` ADD CONSTRAINT `team_messages_recipient_id_fkey` FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_chat_reads` ADD CONSTRAINT `team_chat_reads_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

