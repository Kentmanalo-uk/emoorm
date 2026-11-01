-- How long a new order waits for its shop before it cancels itself.
--
-- Expand only: one column with the value the code already used as its
-- constant (48 hours, two days), so the version still live behaves exactly
-- as it did and nothing needs a backfill. It moves the number out of the
-- environment and into a setting a super admin can change.

ALTER TABLE `app_settings`
  ADD COLUMN `order_confirm_hours` INT NOT NULL DEFAULT 48;
