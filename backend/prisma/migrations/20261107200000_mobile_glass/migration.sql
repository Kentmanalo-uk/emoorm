-- Liquid glass on phones (frosted bars, menus and sheets): ALL, MENUS (the
-- tab bar stays solid) or OFF. A super admin picks it.
--
-- Expand only: one column with a default.

ALTER TABLE `app_settings`
  ADD COLUMN `mobile_glass` VARCHAR(10) NOT NULL DEFAULT 'ALL';
