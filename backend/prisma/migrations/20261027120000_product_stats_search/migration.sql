-- Sold count, rating and a search column kept on each product (expand only:
-- the version still live ignores them). Filled here from the orders and
-- reviews; repositories/productStats.repository.js keeps them up to date.
ALTER TABLE `products`
  ADD COLUMN `sold_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `rating_avg` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `review_count` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `search_text` TEXT NULL;

CREATE INDEX `products_sold_idx` ON `products`(`status`, `deleted_at`, `sold_count`);

UPDATE `products` p
LEFT JOIN (
  SELECT oi.`product_id`, SUM(oi.`quantity`) AS sold
  FROM `order_items` oi
  JOIN `orders` o ON o.`id` = oi.`order_id`
  WHERE o.`status` IN ('COMPLETED', 'DELIVERED', 'PICKED_UP')
  GROUP BY oi.`product_id`
) x ON x.`product_id` = p.`id`
SET p.`sold_count` = COALESCE(x.sold, 0);

UPDATE `products` p
LEFT JOIN (
  SELECT `product_id`, ROUND(AVG(`rating`), 1) AS avg_rating, COUNT(*) AS n
  FROM `reviews`
  WHERE `deleted_at` IS NULL
  GROUP BY `product_id`
) r ON r.`product_id` = p.`id`
SET p.`rating_avg` = COALESCE(r.avg_rating, 0), p.`review_count` = COALESCE(r.n, 0);

UPDATE `products` p
LEFT JOIN `categories` c ON c.`id` = p.`category_id`
LEFT JOIN `stores` s ON s.`id` = p.`store_id`
SET p.`search_text` = CONCAT_WS(' ', p.`name`, p.`description`, c.`name`, s.`name`);
