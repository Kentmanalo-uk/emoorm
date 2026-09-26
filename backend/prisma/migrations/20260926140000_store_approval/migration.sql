-- A shop opens privately when its owner applies to sell and becomes public
-- once an admin approves the application. Existing shops are approved.
ALTER TABLE `stores` ADD COLUMN `is_approved` BOOLEAN NOT NULL DEFAULT true;
