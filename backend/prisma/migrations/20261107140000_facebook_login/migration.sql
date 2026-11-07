-- Continue with Facebook: the id Facebook gives a person for this app,
-- linked to their E-MOORM account like google_id.
--
-- Expand only: one nullable column and its unique index.

ALTER TABLE `users`
  ADD COLUMN `facebook_id` VARCHAR(64) NULL;

CREATE UNIQUE INDEX `users_facebook_id_key` ON `users`(`facebook_id`);
