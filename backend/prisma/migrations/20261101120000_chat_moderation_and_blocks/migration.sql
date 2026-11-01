-- Chat moderation and user blocking.
--
-- Expand only: every column is nullable or has a default, and the two new
-- tables are read by nothing yet, so the version still live ignores all of
-- it. Nothing here needs a backfill.
--
--   messages.flagged_at      stamped with the row when its words matched
--   message_flags            the queue an admin reads
--   user_blocks              one person refusing to deal with another
--   users.chat_strikes       how many of their messages have matched
--   users.chat_restricted_until  set while they may not send messages

-- ── The message carries its own judgement ────────────────────────────────
ALTER TABLE `messages`
  ADD COLUMN `flagged_at` DATETIME(3) NULL;

CREATE INDEX `messages_flagged_at_idx` ON `messages`(`flagged_at`);

-- ── The strike ladder ────────────────────────────────────────────────────
-- Not is_active: that is the whole account, and would lock a seller out of
-- their own shop. Nothing automatic is allowed to do that.
ALTER TABLE `users`
  ADD COLUMN `chat_strikes` INT NOT NULL DEFAULT 0,
  ADD COLUMN `chat_restricted_until` DATETIME(3) NULL;

-- ── One person refusing to deal with another ─────────────────────────────
-- Always person to person. "Block this shop" is stored against whoever owns
-- it, so one row answers the question from either side.
CREATE TABLE `user_blocks` (
  `id`         VARCHAR(191) NOT NULL,
  `blocker_id` VARCHAR(191) NOT NULL,
  `blocked_id` VARCHAR(191) NOT NULL,
  `reason`     VARCHAR(200) NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_blocks_blocker_id_blocked_id_key` (`blocker_id`, `blocked_id`),
  INDEX `user_blocks_blocked_id_idx` (`blocked_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_blocks`
  ADD CONSTRAINT `user_blocks_blocker_id_fkey`
    FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `user_blocks_blocked_id_fkey`
    FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ── The queue ────────────────────────────────────────────────────────────
-- municipality_id routes a flag to the town whose shop the chat belongs to,
-- the same way a report is routed.
CREATE TABLE `message_flags` (
  `id`              VARCHAR(191) NOT NULL,
  `message_id`      VARCHAR(191) NOT NULL,
  `conversation_id` VARCHAR(191) NOT NULL,
  `sender_id`       VARCHAR(191) NOT NULL,
  `matched`         VARCHAR(191) NOT NULL,
  `status`          ENUM('PENDING', 'REVIEWED', 'DISMISSED') NOT NULL DEFAULT 'PENDING',
  `municipality_id` VARCHAR(191) NULL,
  `reviewed_by_id`  VARCHAR(191) NULL,
  `reviewed_at`     DATETIME(3)  NULL,
  `notes`           TEXT         NULL,
  `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `message_flags_message_id_key` (`message_id`),
  INDEX `message_flags_municipality_id_status_created_at_idx` (`municipality_id`, `status`, `created_at`),
  INDEX `message_flags_sender_id_idx` (`sender_id`),
  INDEX `message_flags_status_created_at_idx` (`status`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `message_flags`
  ADD CONSTRAINT `message_flags_message_id_fkey`
    FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `message_flags_sender_id_fkey`
    FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `message_flags_reviewed_by_id_fkey`
    FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
