-- Composite indexes for the hot read paths.
--
-- Before this migration these tables carried only primary keys, unique
-- constraints and single-column foreign-key indexes, so every catalogue
-- browse, order list and notification poll was a full scan plus a filesort.
-- Each index below is ordered equality-columns-first, then the sort column,
-- and is justified by a specific query in the repositories.

-- products ─ src/repositories/product.repository.js findAll()
--   WHERE deleted_at IS NULL AND status = ? [AND municipality_id = ?]
--         [AND category_id = ?] [AND store_id = ?] [AND price BETWEEN ? AND ?]
--   ORDER BY created_at DESC | price
CREATE INDEX `products_public_municipality_idx`
  ON `products` (`status`, `deleted_at`, `municipality_id`, `created_at`);
CREATE INDEX `products_public_category_idx`
  ON `products` (`status`, `deleted_at`, `category_id`, `created_at`);
CREATE INDEX `products_store_idx`
  ON `products` (`store_id`, `deleted_at`, `status`, `created_at`);
CREATE INDEX `products_price_idx`
  ON `products` (`status`, `deleted_at`, `price`);
-- Admin moderation queue: WHERE status = 'PENDING' AND deleted_at IS NULL
CREATE INDEX `products_moderation_idx`
  ON `products` (`deleted_at`, `status`, `created_at`);

-- stores ─ src/repositories/store.repository.js findAll()
--   WHERE deleted_at IS NULL [AND is_active = ?] [AND is_suspended = ?]
--         [AND municipality_id = ?] ORDER BY created_at DESC
CREATE INDEX `stores_public_idx`
  ON `stores` (`deleted_at`, `is_active`, `is_suspended`, `municipality_id`, `created_at`);

-- orders ─ src/repositories/order.repository.js findAll()
--   WHERE buyer_id = ? | store_id = ? [AND status = ?] ORDER BY created_at DESC
CREATE INDEX `orders_buyer_idx` ON `orders` (`buyer_id`, `created_at`);
CREATE INDEX `orders_store_status_idx` ON `orders` (`store_id`, `status`, `created_at`);
-- Order expiry sweep runs every 5 minutes: WHERE status = ? AND created_at < ?
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`, `created_at`);

-- reviews ─ src/repositories/review.repository.js findAll() and the storefront
--   rating aggregate: WHERE deleted_at IS NULL AND product_id = ?
CREATE INDEX `reviews_product_idx` ON `reviews` (`product_id`, `deleted_at`, `created_at`);
CREATE INDEX `reviews_user_idx` ON `reviews` (`user_id`, `deleted_at`, `created_at`);

-- notifications ─ polled by every signed-in client on a 60s timer:
--   WHERE user_id = ? AND deleted_at IS NULL [AND is_read = ?] ORDER BY created_at DESC
CREATE INDEX `notifications_user_feed_idx`
  ON `notifications` (`user_id`, `deleted_at`, `is_read`, `created_at`);

-- users ─ admin listings and the seller-application queue
CREATE INDEX `users_role_municipality_idx`
  ON `users` (`deleted_at`, `role`, `municipality_id`, `created_at`);
CREATE INDEX `users_seller_application_idx`
  ON `users` (`seller_application_status`, `deleted_at`, `seller_application_date`);
CREATE INDEX `users_shop_municipality_idx`
  ON `users` (`shop_municipality_id`, `seller_application_status`);

-- audit_logs ─ the admin log viewer, newest first, optionally per actor/entity
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`user_id`, `created_at`);
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity`, `entity_id`);

-- order_items ─ seller analytics group by product
CREATE INDEX `order_items_product_idx` ON `order_items` (`product_id`, `order_id`);

-- categories ─ the public list is always WHERE is_active = 1 ORDER BY name
CREATE INDEX `categories_active_idx` ON `categories` (`is_active`, `name`);
