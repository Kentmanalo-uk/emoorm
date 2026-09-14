ALTER TABLE `products`
  ADD COLUMN `return_policy` JSON NULL,
  ADD COLUMN `variations` JSON NULL;

ALTER TABLE `order_items`
  ADD COLUMN `selected_variations` JSON NULL,
  ADD COLUMN `return_policy_snapshot` JSON NULL;
