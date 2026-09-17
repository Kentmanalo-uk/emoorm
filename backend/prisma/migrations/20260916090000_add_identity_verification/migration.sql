-- CreateTable
CREATE TABLE `identity_verifications` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('NOT_VERIFIED', 'PENDING', 'VERIFIED', 'FAILED') NOT NULL DEFAULT 'NOT_VERIFIED',
    `id_type` VARCHAR(191) NULL,
    `encrypted_data` TEXT NULL,
    `id_number_hash` VARCHAR(191) NULL,
    `failure_reason` TEXT NULL,
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `last_attempt_at` DATETIME(3) NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `identity_verifications_user_id_key`(`user_id`),
    UNIQUE INDEX `identity_verifications_id_number_hash_key`(`id_number_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `identity_verifications` ADD CONSTRAINT `identity_verifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
