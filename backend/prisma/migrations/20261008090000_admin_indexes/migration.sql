-- Indexes for the municipal admin pages' reads.
--
-- Each one serves a query that was a full scan or a filesort of the whole
-- table (EXPLAIN: type=ALL or "Using filesort"); every one is added online.

-- orders ─ src/services/moderation.service.js getAttentionQueue(), polled by
-- every open admin page each minute:
--   WHERE payment_status = 'PENDING_VERIFICATION' AND updated_at < ?
CREATE INDEX `orders_payment_status_idx` ON `orders`(`payment_status`, `updated_at`);
-- orders ─ src/repositories/order.repository.js findAll(), the admin list:
--   ORDER BY created_at DESC LIMIT ?
CREATE INDEX `orders_created_idx` ON `orders`(`created_at`);

-- notifications ─ src/repositories/notification.repository.js findByUserId()
-- and getUnreadCount(), the admin bell, rail and list:
--   WHERE user_id = ? AND audience = ? AND deleted_at IS NULL ORDER BY created_at DESC
--   WHERE user_id = ? AND audience = ? AND is_read = false AND deleted_at IS NULL (count)
CREATE INDEX `notifications_user_audience_feed_idx` ON `notifications`(`user_id`, `audience`, `deleted_at`, `created_at`);
CREATE INDEX `notifications_user_audience_unread_idx` ON `notifications`(`user_id`, `audience`, `is_read`, `deleted_at`);

-- reviews ─ src/services/moderation.service.js listReviews():
--   WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?
CREATE INDEX `reviews_moderation_idx` ON `reviews`(`deleted_at`, `created_at`);

-- return_requests ─ src/services/moderation.service.js listReturns(), by
-- status or all of them, and the attention queue's open returns:
--   [WHERE status = ?] ORDER BY created_at DESC LIMIT ?
CREATE INDEX `return_requests_status_created_idx` ON `return_requests`(`status`, `created_at`);
CREATE INDEX `return_requests_created_idx` ON `return_requests`(`created_at`);

-- support_conversations ─ src/repositories/supportChat.repository.js findMany(),
-- a town's inbox:
--   WHERE municipality_id = ? ORDER BY last_message_at DESC, created_at DESC LIMIT ?
CREATE INDEX `support_conversations_inbox_idx` ON `support_conversations`(`municipality_id`, `last_message_at`, `created_at`);
