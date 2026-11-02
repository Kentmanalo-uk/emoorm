-- The little creature a person picked for themselves, when they picked one
-- (mobile/src/components/avatars). Expand only: the version still live
-- ignores the column.
--
-- Null is the ordinary case and does not mean "no picture". An account with
-- no photo and no choice is shown the avatar its own id works out to, so
-- every account already has one -- including every account that existed
-- before this column did. The column records a deliberate choice, which is
-- the only thing that cannot be worked out again.
ALTER TABLE `users`
  ADD COLUMN `avatar_key` VARCHAR(16) NULL;
