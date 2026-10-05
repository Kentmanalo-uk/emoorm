-- Whether an order line took stock when it was ordered. Cancellations and
-- returns give back only what a line took, whatever the product is now.
ALTER TABLE `order_items` ADD COLUMN `stock_taken` BOOLEAN NOT NULL DEFAULT true;

-- Paluto (cooked to order) lines never took any.
UPDATE `order_items` oi
  JOIN `products` p ON p.`id` = oi.`product_id`
  SET oi.`stock_taken` = false
  WHERE p.`product_type` = 'COOK_TO_ORDER';
