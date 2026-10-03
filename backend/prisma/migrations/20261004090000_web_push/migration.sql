-- Browser push: the subscription's address and keys. `token` holds a hash of
-- the address (the address itself can be longer than a unique index allows).
ALTER TABLE `push_tokens`
  ADD COLUMN `endpoint` TEXT NULL,
  ADD COLUMN `keys` JSON NULL;
