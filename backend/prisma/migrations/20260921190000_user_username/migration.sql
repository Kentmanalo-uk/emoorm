-- Public handle shown on profiles and shop pages.
--
-- Added nullable so it can land on a populated table; a one-off backfill
-- gives every existing account a unique handle right after this runs, and
-- registration assigns one from then on. Unique index is case-insensitive
-- in MySQL's default collation, which matches the lowercase-only rule.
ALTER TABLE `users`
  ADD COLUMN `username` VARCHAR(20) NULL;

CREATE UNIQUE INDEX `users_username_key` ON `users`(`username`);
