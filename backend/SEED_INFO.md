# Database Seed Information

## Overview
The database has been seeded with sample data for testing the E-MOORM platform.

## Seeded Data Summary

### 📊 Statistics
- **Stores**: 5
- **Products**: 33+ (across 8 categories)
- **Reviews**: 10+
- **Wishlist Items**: 8+ (for test buyers)
- **Sellers**: 5

### 🏪 Stores Created
1. **Mindoro Crafts Hub** - Authentic Mindoro handicrafts and traditional items
2. **Local Harvest Market** - Fresh local produce and organic food products
3. **Island Artisans** - Handmade products from local artisans
4. **Green Valley Store** - Eco-friendly and sustainable goods
5. **Coastal Treasures** - Unique finds from coastal communities

### 📦 Product Categories
Products are distributed across the following categories:
- **Handicrafts** (5 products) - Baskets, wind chimes, wall decor, table runners, native bags
- **Local Delicacies** (4 products) - Bibingka, pastillas, puto, ube halaya
- **Processed Foods** (4 products) - Honey, coconut sugar, coconut oil, peanut brittle
- **Dried Goods** (4 products) - Dried mangoes, banana chips, dried fish, squid strips
- **Fruits** (4 products) - Mangoes, pineapple, bananas
- **Vegetables** (4 products) - Lettuce, tomatoes, eggplant, string beans
- **Seafood** (4 products) - Tilapia, dilis, shrimp, squid
- **Beverages** (4 products) - Buko juice, calamansi, ginger tea, lemongrass tea

### 👥 Test Accounts

#### Sellers (5 accounts)
- seller1@emoorm.local / <see backend/prisma/seed.js — local defaults, override with SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD> (Mindoro Crafts Hub)
- seller2@emoorm.local / <see backend/prisma/seed.js — local defaults, override with SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD> (Local Harvest Market)
- seller3@emoorm.local / <see backend/prisma/seed.js — local defaults, override with SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD> (Island Artisans)
- seller4@emoorm.local / <see backend/prisma/seed.js — local defaults, override with SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD> (Green Valley Store)
- seller5@emoorm.local / <see backend/prisma/seed.js — local defaults, override with SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD> (Coastal Treasures)

#### Buyers (existing)
- buyer1@emoorm.local / <see backend/prisma/seed.js — local defaults, override with SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD>
- testuser2@emoorm.local / <see backend/prisma/seed.js — local defaults, override with SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD>

## Running the Seed Script

### First Time Setup
```bash
cd backend
npm run seed
```

### Re-running the Seed
The seed script is idempotent and will:
- Use existing stores if they already exist
- Create new products each time (with unique slugs)
- Skip duplicate wishlist items
- Create new reviews

### Clearing Data
To start fresh, you can:
1. Drop and recreate the database
2. Run Prisma migrations: `npx prisma migrate reset`
3. Run seed script: `npm run seed`

## Product Details

### Price Range
- Lowest: ₱80 (Organic Lettuce)
- Highest: ₱650 (Rattan Wall Decor)
- Average: ~₱220

### Stock Levels
- Products have varying stock levels (8-60 units)
- Some products have low stock (< 15) for testing low stock warnings
- Most products have healthy stock levels (25-60)

### Images
Products use placeholder images. You can replace these with actual product images by:
1. Uploading images to a CDN or public folder
2. Updating the `images` field in the database

## Sample Product IDs
Use these for testing:
- Check `npx prisma studio` to view all products and their IDs
- Or query: `GET /api/products` to see all products

## Next Steps

1. **Browse Products**: Visit http://localhost:5174/products
2. **Test Shopping Flow**: 
   - View product details
   - Add products to cart
   - Proceed to checkout
   - Place orders

3. **Test Features**:
   - Product filtering by category
   - Search functionality
   - Price range filtering
   - Sorting options
   - Pagination

4. **Verify Data**:
   - Use Prisma Studio: `npx prisma studio`
   - Check orders table after placing test orders
   - Verify reviews display on product pages

## Maintenance

### Adding More Products
Edit `prisma/seed.js` and add more products to the `PRODUCTS_DATA` object, then run:
```bash
npm run seed
```

### Updating Product Images
Replace placeholder URLs in the seed script with actual image URLs or update via:
- Prisma Studio
- API endpoints
- Direct database updates

## Notes
- All sellers are pre-verified and active
- All products are pre-approved (`status: APPROVED`)
- Products are distributed across different municipalities
- Each store has products from multiple categories
