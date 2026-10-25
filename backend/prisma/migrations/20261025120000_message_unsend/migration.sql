-- Unsend: within an hour of sending, the sender can take a chat message back.
-- The row stays (so the chat shows "unsent a message"); its content is wiped.
ALTER TABLE `messages` ADD COLUMN `unsent_at` DATETIME(3) NULL;
