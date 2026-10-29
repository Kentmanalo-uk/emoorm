-- An admin's email to many people (services/adminEmail.service): the send,
-- and each person's copy in the outbox until it goes.
ALTER TABLE `email_outbox` ADD COLUMN `broadcast_id` VARCHAR(36) NULL;
CREATE INDEX `email_outbox_broadcast_id_idx` ON `email_outbox`(`broadcast_id`);

CREATE TABLE `email_broadcasts` (
    `id` VARCHAR(191) NOT NULL,
    `sender_id` VARCHAR(191) NULL,
    `sender_email` VARCHAR(191) NULL,
    `sender_role` ENUM('BUYER', 'SELLER', 'MUNICIPAL_ADMIN', 'SUPER_ADMIN') NOT NULL,
    `municipality_id` VARCHAR(191) NULL,
    `audience` VARCHAR(20) NOT NULL,
    `subject` VARCHAR(150) NOT NULL,
    `message` TEXT NOT NULL,
    `recipients` INTEGER NOT NULL,
    `sent` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `email_broadcasts_municipality_id_created_at_idx`(`municipality_id`, `created_at`),
    INDEX `email_broadcasts_sender_id_created_at_idx`(`sender_id`, `created_at`),
    INDEX `email_broadcasts_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
