-- Security hardening: make duplicate-submission protection a database
-- guarantee rather than an application-level check-then-act.
--
-- Before this, five concurrent checkouts with the same checkout key produced
-- five orders (buyer charged five times, stock deducted five times), because
-- findByCheckoutKey() ran before any of the inserts committed.
--
-- checkout_key is nullable and MySQL allows repeated NULLs in a unique index,
-- so orders submitted without a key are unaffected.
DROP INDEX `orders_buyer_id_checkout_key_idx` ON `orders`;
CREATE UNIQUE INDEX `orders_buyer_checkout_key_unique` ON `orders` (`buyer_id`, `checkout_key`);
