-- Emails waiting to be sent again (utils/email.js, the email-outbox job).
CREATE TABLE `email_outbox` (
    `id` VARCHAR(191) NOT NULL,
    `to` VARCHAR(320) NOT NULL,
    `subject` VARCHAR(300) NOT NULL,
    `html` MEDIUMTEXT NULL,
    `text` MEDIUMTEXT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 1,
    `last_error` VARCHAR(500) NULL,
    `next_attempt_at` DATETIME(3) NOT NULL,
    `claimed_until` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `email_outbox_next_attempt_at_idx`(`next_attempt_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
