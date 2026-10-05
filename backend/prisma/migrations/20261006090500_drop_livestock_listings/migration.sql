-- The abandoned livestock listings feature kept its facts in this table on
-- development databases (production never had it). Live animals are products
-- with productType LIVESTOCK now; their facts live in products.details.
DROP TABLE IF EXISTS `livestock_listings`;
