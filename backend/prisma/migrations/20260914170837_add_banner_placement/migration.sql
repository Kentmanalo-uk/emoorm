-- DropIndex
DROP INDEX `banners_is_active_sort_order_idx` ON `banners`;

-- AlterTable
ALTER TABLE `banners` ADD COLUMN `placement` ENUM('HOME_CAROUSEL', 'HOME_SIDEBAR_TOP', 'HOME_SIDEBAR_BOTTOM') NOT NULL DEFAULT 'HOME_CAROUSEL';

-- CreateIndex
CREATE INDEX `banners_placement_is_active_sort_order_idx` ON `banners`(`placement`, `is_active`, `sort_order`);
