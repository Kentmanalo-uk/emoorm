ALTER TABLE `orders`
  ADD COLUMN `checkout_key` VARCHAR(191) NULL,
  ADD INDEX `orders_buyer_id_checkout_key_idx` (`buyer_id`, `checkout_key`);
