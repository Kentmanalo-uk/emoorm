-- A shop's own photo designs, made in the website's design editor: pieces
-- (text, the logo, shapes, uploaded pictures) drawn over a product's photos
-- like the ten ready designs (utils/photoDesign.js describes `layers`).
--
--   store_photo_designs        a shop's designs; deleting the shop deletes them
--   products.photo_design_id   the design a product uses when its
--                              image_overlay is 'custom'; deleting the design
--                              turns the product's design off
--
-- Expand only: a new table and a nullable column that nothing reads yet.

CREATE TABLE `store_photo_designs` (
  `id` VARCHAR(191) NOT NULL,
  `store_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `layers` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `store_photo_designs_store_idx`(`store_id`),
  INDEX `store_photo_designs_updated_idx`(`updated_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `store_photo_designs`
  ADD CONSTRAINT `store_photo_designs_store_id_fkey`
    FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `products`
  ADD COLUMN `photo_design_id` VARCHAR(191) NULL;

CREATE INDEX `products_photo_design_id_idx` ON `products`(`photo_design_id`);

ALTER TABLE `products`
  ADD CONSTRAINT `products_photo_design_id_fkey`
    FOREIGN KEY (`photo_design_id`) REFERENCES `store_photo_designs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
