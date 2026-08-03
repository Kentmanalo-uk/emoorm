-- E-MOORM Database Seed Data
-- Oriental Mindoro Municipalities and Categories

-- Insert Municipalities
INSERT INTO municipalities (id, name, code, is_active, created_at, updated_at) VALUES
(UUID(), 'Baco', 'BACO', 1, NOW(), NOW()),
(UUID(), 'Bansud', 'BANSUD', 1, NOW(), NOW()),
(UUID(), 'Bongabong', 'BONGABONG', 1, NOW(), NOW()),
(UUID(), 'Bulalacao', 'BULALACAO', 1, NOW(), NOW()),
(UUID(), 'Calapan City', 'CALAPAN', 1, NOW(), NOW()),
(UUID(), 'Gloria', 'GLORIA', 1, NOW(), NOW()),
(UUID(), 'Mansalay', 'MANSALAY', 1, NOW(), NOW()),
(UUID(), 'Naujan', 'NAUJAN', 1, NOW(), NOW()),
(UUID(), 'Pinamalayan', 'PINAMALAYAN', 1, NOW(), NOW()),
(UUID(), 'Pola', 'POLA', 1, NOW(), NOW()),
(UUID(), 'Puerto Galera', 'PUERTO_GALERA', 1, NOW(), NOW()),
(UUID(), 'Roxas', 'ROXAS', 1, NOW(), NOW()),
(UUID(), 'San Teodoro', 'SAN_TEODORO', 1, NOW(), NOW()),
(UUID(), 'Socorro', 'SOCORRO', 1, NOW(), NOW()),
(UUID(), 'Victoria', 'VICTORIA', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE name=name;

-- Insert Categories
INSERT INTO categories (id, name, slug, description, icon, is_active, created_at, updated_at) VALUES
(UUID(), 'Fruits', 'fruits', 'Fresh fruits from local farmers', '🍎', 1, NOW(), NOW()),
(UUID(), 'Vegetables', 'vegetables', 'Fresh vegetables from local farms', '🥬', 1, NOW(), NOW()),
(UUID(), 'Rice', 'rice', 'Locally grown rice varieties', '🌾', 1, NOW(), NOW()),
(UUID(), 'Livestock', 'livestock', 'Poultry, pork, beef, and other livestock products', '🐄', 1, NOW(), NOW()),
(UUID(), 'Seafood', 'seafood', 'Fresh catch from local waters', '🐟', 1, NOW(), NOW()),
(UUID(), 'Processed Foods', 'processed-foods', 'Locally processed food products', '🥫', 1, NOW(), NOW()),
(UUID(), 'Handicrafts', 'handicrafts', 'Traditional and modern handicrafts', '🎨', 1, NOW(), NOW()),
(UUID(), 'Local Delicacies', 'local-delicacies', 'Traditional local food specialties', '🍰', 1, NOW(), NOW()),
(UUID(), 'Dried Goods', 'dried-goods', 'Dried fish, fruits, and other preserved products', '🌰', 1, NOW(), NOW()),
(UUID(), 'Beverages', 'beverages', 'Local drinks and beverages', '🥤', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE name=name;
