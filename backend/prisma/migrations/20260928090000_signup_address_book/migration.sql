-- The address given at sign-up is now also the account's first delivery
-- address. Accounts made since the address book began have it on the
-- profile only: give each buyer or seller with a complete address (town,
-- barangay, street and a contact number) and no saved addresses a default
-- "Home" address built from it.
INSERT INTO `addresses` (`id`, `user_id`, `label`, `full_name`, `contact_number`, `province`, `municipality_id`, `barangay`, `street`, `is_default`, `created_at`, `updated_at`)
SELECT UUID(), u.`id`, 'Home', u.`full_name`, TRIM(u.`contact_number`), 'Oriental Mindoro', u.`municipality_id`, TRIM(u.`barangay`), TRIM(u.`address`), true, NOW(3), NOW(3)
FROM `users` u
WHERE u.`role` IN ('BUYER', 'SELLER')
  AND u.`address` IS NOT NULL AND TRIM(u.`address`) != ''
  AND u.`barangay` IS NOT NULL AND TRIM(u.`barangay`) != ''
  AND u.`contact_number` IS NOT NULL AND TRIM(u.`contact_number`) != ''
  AND NOT EXISTS (SELECT 1 FROM `addresses` a WHERE a.`user_id` = u.`id`);
