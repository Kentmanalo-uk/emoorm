/*
  Warnings:

  - You are about to drop the column `icon` on the `categories` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `categories` DROP COLUMN `icon`,
    ADD COLUMN `image` VARCHAR(191) NULL;
