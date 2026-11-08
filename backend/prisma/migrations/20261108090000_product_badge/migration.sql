-- A label a seller can put on a product, shown before its name: Pre-order,
-- Palengke (fresh market produce) or DIY. Only a label: ordering, stock and
-- checkout are unchanged. NULL is none.
--
-- Expand only: one nullable column.

ALTER TABLE `products`
  ADD COLUMN `badge` VARCHAR(20) NULL;
