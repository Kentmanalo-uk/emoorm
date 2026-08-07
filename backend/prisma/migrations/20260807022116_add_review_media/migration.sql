-- AlterTable
ALTER TABLE `reviews` ADD COLUMN `images` JSON NULL,
    ADD COLUMN `video_url` VARCHAR(191) NULL;
