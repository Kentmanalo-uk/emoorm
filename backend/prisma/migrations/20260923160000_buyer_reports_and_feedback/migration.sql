-- Reports only ever pointed one way: a buyer reporting a product or a seller.
-- A seller with an abusive or fraudulent customer had nowhere to go. Add the
-- other direction, routed to the BUYER's municipality — that admin is the one
-- who can act on the account.
ALTER TABLE `reports` MODIFY `type` ENUM('PRODUCT', 'SELLER', 'BUYER') NOT NULL;

ALTER TABLE `reports` ADD COLUMN `reported_buyer_id` VARCHAR(191) NULL;

CREATE INDEX `reports_buyer_idx` ON `reports`(`reported_buyer_id`);

ALTER TABLE `reports`
  ADD CONSTRAINT `reports_reported_buyer_id_fkey`
  FOREIGN KEY (`reported_buyer_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Platform feedback sent from the top bar. Kept apart from support cases on
-- purpose: a case is a conversation someone is waiting on, this is a one-way
-- note to whoever runs the platform.
CREATE TABLE `feedback` (
  `id`               VARCHAR(191) NOT NULL,
  `user_id`          VARCHAR(191) NULL,
  `role`             ENUM('BUYER', 'SELLER', 'MUNICIPAL_ADMIN', 'SUPER_ADMIN') NULL,
  `page`             VARCHAR(200) NULL,
  `municipality_id`  VARCHAR(191) NULL,
  `category`         ENUM('USABILITY', 'PERFORMANCE', 'BUG', 'FEATURE_REQUEST', 'DESIGN', 'PRAISE', 'OTHER') NOT NULL DEFAULT 'OTHER',
  `rating`           INTEGER NULL,
  `message`          TEXT NOT NULL,
  `status`           ENUM('NEW', 'REVIEWED', 'ARCHIVED') NOT NULL DEFAULT 'NEW',
  `admin_notes`      TEXT NULL,
  `reviewed_at`      DATETIME(3) NULL,
  `reviewed_by_id`   VARCHAR(191) NULL,
  `created_at`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `feedback_status_idx`(`status`, `created_at`),
  INDEX `feedback_category_idx`(`category`, `created_at`),
  INDEX `feedback_municipality_idx`(`municipality_id`, `created_at`),
  INDEX `feedback_user_idx`(`user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- SET NULL throughout: deleting an account or a municipality must not erase
-- what people told us about the product.
ALTER TABLE `feedback`
  ADD CONSTRAINT `feedback_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `feedback`
  ADD CONSTRAINT `feedback_municipality_id_fkey`
  FOREIGN KEY (`municipality_id`) REFERENCES `municipalities`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `feedback`
  ADD CONSTRAINT `feedback_reviewed_by_id_fkey`
  FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
