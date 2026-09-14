CREATE TABLE `inventory_movements` (
  `id` VARCHAR(191) NOT NULL,
  `product_id` VARCHAR(191) NOT NULL,
  `quantity_delta` INT NOT NULL,
  `balance_after` INT NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `reference_id` VARCHAR(191) NULL,
  `actor_id` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `inventory_movements_product_id_created_at_idx` (`product_id`, `created_at`),
  INDEX `inventory_movements_reference_id_idx` (`reference_id`),
  CONSTRAINT `inventory_movements_product_id_fkey`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
