-- The cart is saved to the account. A line is a product with its chosen
-- options, so the same product in two sizes is two lines.
ALTER TABLE `cart_items`
  ADD COLUMN `variation_key` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `selected_variations` JSON NULL;

-- The new key first: the user foreign key needs an index starting with user_id.
CREATE UNIQUE INDEX `cart_items_user_product_variation_key` ON `cart_items`(`user_id`, `product_id`, `variation_key`);
DROP INDEX `cart_items_user_id_product_id_key` ON `cart_items`;
