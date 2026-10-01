-- Homepage "Shop by Category": pictures (as before) or gradient icons, chosen
-- by a super admin; and an optional icon per category (null: from its name).
ALTER TABLE `app_settings`
  ADD COLUMN `category_style` VARCHAR(10) NOT NULL DEFAULT 'IMAGE';

ALTER TABLE `categories`
  ADD COLUMN `icon` VARCHAR(40) NULL;
