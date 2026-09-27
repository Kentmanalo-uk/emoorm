-- The account buyers pay with the shop's QR: its name and number, shown
-- beside the QR at checkout. Both stay empty until the seller adds them.
ALTER TABLE `stores` ADD COLUMN `payment_account_name` VARCHAR(120) NULL,
    ADD COLUMN `payment_account_number` VARCHAR(40) NULL;
