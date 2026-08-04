const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Sample product images (placeholder URLs)
const PLACEHOLDER_IMAGES = [
  'https://via.placeholder.com/600x600/059669/ffffff?text=Product+1',
  'https://via.placeholder.com/600x600/047857/ffffff?text=Product+2',
  'https://via.placeholder.com/600x600/16a34a/ffffff?text=Product+3',
  'https://via.placeholder.com/600x600/22c55e/ffffff?text=Product+4',
];

// Product data by category
const PRODUCTS_DATA = {
  'Handicrafts': [
    { name: 'Handwoven Nito Basket', description: 'Beautiful handwoven nito basket, perfect for home decoration or storage. Made by local artisans in Oriental Mindoro.', price: 450, stock: 15 },
    { name: 'Bamboo Wind Chimes', description: 'Traditional bamboo wind chimes producing soothing sounds. Handcrafted with natural materials.', price: 280, stock: 25 },
    { name: 'Rattan Wall Decor', description: 'Elegant rattan wall decoration featuring traditional Mangyan patterns.', price: 650, stock: 10 },
    { name: 'Woven Table Runner', description: 'Handwoven table runner made from indigenous materials. Adds rustic charm to any dining table.', price: 380, stock: 20 },
    { name: 'Native Bag', description: 'Handcrafted native bag made from natural fibers. Perfect for everyday use.', price: 520, stock: 12 },
  ],
  'Local Delicacies': [
    { name: 'Bibingka Rice Cake', description: 'Traditional rice cake baked to perfection with coconut and cheese toppings.', price: 180, stock: 25 },
    { name: 'Pastillas de Leche', description: 'Soft and sweet milk candies made from carabao milk. A local favorite!', price: 150, stock: 40 },
    { name: 'Puto Cheese', description: 'Steamed rice cakes topped with cheese. Soft, fluffy, and delicious.', price: 120, stock: 35 },
    { name: 'Ube Halaya (500g)', description: 'Purple yam jam made from fresh ube. Perfect spread or dessert ingredient.', price: 280, stock: 20 },
  ],
  'Processed Foods': [
    { name: 'Organic Honey (500g)', description: 'Pure organic honey harvested from local beekeepers in the mountains of Oriental Mindoro.', price: 320, stock: 30 },
    { name: 'Coconut Sugar (1kg)', description: 'Natural coconut sugar, unrefined and rich in nutrients. Perfect sweetener alternative.', price: 180, stock: 50 },
    { name: 'Virgin Coconut Oil (500ml)', description: 'Pure virgin coconut oil, cold-pressed from fresh coconuts. Multi-purpose oil.', price: 380, stock: 25 },
    { name: 'Peanut Brittle', description: 'Crunchy peanut brittle made with locally-sourced peanuts and coconut sugar.', price: 150, stock: 35 },
  ],
  'Dried Goods': [
    { name: 'Dried Mangoes (250g)', description: 'Sweet and chewy dried mangoes made from the finest Oriental Mindoro mangoes.', price: 220, stock: 40 },
    { name: 'Banana Chips (200g)', description: 'Crispy banana chips, lightly salted or sweetened. Great snack for any time.', price: 120, stock: 60 },
    { name: 'Dried Fish (Tuyo)', description: 'Traditional dried fish, perfect with rice. Rich in protein and flavor.', price: 180, stock: 30 },
    { name: 'Dried Squid Strips', description: 'Tasty dried squid strips. Great beer match or snack.', price: 200, stock: 25 },
  ],
  'Fruits': [
    { name: 'Fresh Carabao Mangoes (1kg)', description: 'Sweet and juicy Philippine mangoes, freshly harvested from Mindoro farms.', price: 280, stock: 50 },
    { name: 'Green Mangoes (1kg)', description: 'Crisp and sour green mangoes, perfect for salads or with bagoong.', price: 180, stock: 45 },
    { name: 'Pineapple (1pc)', description: 'Sweet and tangy fresh pineapple. Excellent source of vitamins.', price: 120, stock: 35 },
    { name: 'Banana Lakatan (1kg)', description: 'Premium lakatan bananas, naturally sweet and aromatic.', price: 150, stock: 60 },
  ],
  'Vegetables': [
    { name: 'Organic Lettuce (bundle)', description: 'Fresh organic lettuce grown without pesticides. Crisp and nutritious.', price: 80, stock: 30 },
    { name: 'Native Tomatoes (500g)', description: 'Fresh native tomatoes, bursting with flavor. Perfect for salads and cooking.', price: 100, stock: 40 },
    { name: 'Eggplant (1kg)', description: 'Fresh eggplant, ideal for grilling, frying, or adding to dishes.', price: 90, stock: 35 },
    { name: 'String Beans (500g)', description: 'Crisp and fresh string beans, great for stir-fry and pinakbet.', price: 85, stock: 45 },
  ],
  'Seafood': [
    { name: 'Fresh Tilapia (1kg)', description: 'Freshly caught tilapia from local fish farms. Clean and ready to cook.', price: 220, stock: 25 },
    { name: 'Dried Dilis (250g)', description: 'Small dried anchovies, perfect for breakfast or as topping.', price: 140, stock: 40 },
    { name: 'Fresh Shrimp (500g)', description: 'Fresh shrimp caught daily. Sweet and succulent.', price: 450, stock: 15 },
    { name: 'Squid Fresh (500g)', description: 'Fresh squid, perfect for grilling, frying, or adding to your favorite dishes.', price: 280, stock: 20 },
  ],
  'Beverages': [
    { name: 'Buko Juice (1L)', description: 'Refreshing young coconut juice, naturally sweet and hydrating.', price: 80, stock: 30 },
    { name: 'Calamansi Concentrate (500ml)', description: 'Pure calamansi juice concentrate. Just add water and sweetener.', price: 120, stock: 25 },
    { name: 'Ginger Tea (50g)', description: 'Organic ginger tea blend. Warming and soothing.', price: 150, stock: 35 },
    { name: 'Lemongrass Tea (50g)', description: 'Dried lemongrass for tea. Calming and aromatic.', price: 140, stock: 30 },
  ],
};

// Store names and descriptions
const STORES_DATA = [
  { name: 'Mindoro Crafts Hub', description: 'Your one-stop shop for authentic Mindoro handicrafts and traditional items.', municipalityIndex: 0 },
  { name: 'Local Harvest Market', description: 'Fresh local produce and organic food products from Oriental Mindoro farms.', municipalityIndex: 1 },
  { name: 'Island Artisans', description: 'Supporting local artisans by showcasing their handmade products.', municipalityIndex: 2 },
  { name: 'Green Valley Store', description: 'Eco-friendly products and sustainable goods for conscious consumers.', municipalityIndex: 3 },
  { name: 'Coastal Treasures', description: 'Unique finds from the coastal communities of Oriental Mindoro.', municipalityIndex: 4 },
];

async function main() {
  console.log('🌱 Starting database seeding...\n');

  // Get existing municipalities
  const municipalities = await prisma.municipality.findMany({
    orderBy: { name: 'asc' },
  });

  if (municipalities.length === 0) {
    console.error('❌ No municipalities found. Please ensure municipalities are created first.');
    return;
  }

  console.log(`✓ Found ${municipalities.length} municipalities`);

  // Seed admin accounts
  console.log('\n👑 Seeding admin accounts...');
  const firstMun = municipalities[0];

  await prisma.user.upsert({
    where: { email: 'superadmin@emoorm.local' },
    update: {},
    create: {
      email: 'superadmin@emoorm.local',
      password: await bcrypt.hash('SuperAdmin@1234', 10),
      fullName: 'Super Admin',
      contactNumber: '09170000001',
      municipalityId: firstMun.id,
      role: 'SUPER_ADMIN',
      isActive: true,
      isVerified: true,
    },
  });
  console.log('  ✓ superadmin@emoorm.local / SuperAdmin@1234  [SUPER_ADMIN]');

  await prisma.user.upsert({
    where: { email: 'munadmin@emoorm.local' },
    update: {},
    create: {
      email: 'munadmin@emoorm.local',
      password: await bcrypt.hash('MunAdmin@1234', 10),
      fullName: 'Municipal Admin',
      contactNumber: '09170000002',
      municipalityId: firstMun.id,
      role: 'MUNICIPAL_ADMIN',
      isActive: true,
      isVerified: true,
    },
  });
  console.log(`  ✓ munadmin@emoorm.local  / MunAdmin@1234   [MUNICIPAL_ADMIN — ${firstMun.name}]\n`);

  // Get existing categories
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
  });

  if (categories.length === 0) {
    console.error('❌ No categories found. Please ensure categories are created first.');
    return;
  }

  console.log(`✓ Found ${categories.length} categories\n`);

  // Create sellers and stores
  console.log('📦 Creating sellers and stores...');
  let stores = [];

  // Check if stores already exist
  const existingStores = await prisma.store.findMany();

  if (existingStores.length > 0) {
    console.log(`  ℹ️  Found ${existingStores.length} existing stores, using them...`);
    stores = existingStores;
  } else {
    for (let i = 0; i < STORES_DATA.length; i++) {
      const storeData = STORES_DATA[i];
      const municipality = municipalities[storeData.municipalityIndex % municipalities.length];

      // Create seller user
      const seller = await prisma.user.create({
        data: {
          email: `seller${i + 1}@emoorm.local`,
          password: await bcrypt.hash('Test@1234', 10),
          fullName: `${storeData.name} Owner`,
          contactNumber: `0917${String(i + 1).padStart(7, '0')}`,
          municipalityId: municipality.id,
          role: 'SELLER',
          isActive: true,
          isVerified: true,
        },
      });

      // Create store
      const store = await prisma.store.create({
        data: {
          name: storeData.name,
          slug: storeData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          description: storeData.description,
          ownerId: seller.id,
          municipalityId: municipality.id,
          isActive: true,
        },
      });

      stores.push(store);
      console.log(`  ✓ Created store: ${store.name}`);
    }
  }

  console.log(`\n✓ Using ${stores.length} stores\n`);

  // Create products
  console.log('🛍️  Creating products...');
  let productCount = 0;

  for (const [categoryName, products] of Object.entries(PRODUCTS_DATA)) {
    const category = categories.find(c => c.name === categoryName);

    if (!category) {
      console.log(`  ⚠️  Category "${categoryName}" not found, skipping...`);
      continue;
    }

    for (let i = 0; i < products.length; i++) {
      const productData = products[i];
      const store = stores[i % stores.length]; // Distribute products across stores
      const municipality = municipalities[i % municipalities.length];

      // Create unique slug
      const baseSlug = productData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const slug = `${baseSlug}-${Date.now()}-${i}`;

      // Random number of images (1-4)
      const imageCount = Math.floor(Math.random() * 3) + 1;
      const images = PLACEHOLDER_IMAGES.slice(0, imageCount);

      await prisma.product.create({
        data: {
          name: productData.name,
          slug,
          description: productData.description,
          price: productData.price,
          stock: productData.stock,
          images: JSON.stringify(images),
          storeId: store.id,
          categoryId: category.id,
          municipalityId: municipality.id,
          status: 'APPROVED',
        },
      });

      productCount++;
    }

    console.log(`  ✓ Created ${products.length} products in "${categoryName}"`);
  }

  console.log(`\n✓ Created ${productCount} products total\n`);

  // Create some sample reviews for products
  console.log('⭐ Creating sample reviews...');

  const products = await prisma.product.findMany({ take: 10 });
  const buyers = await prisma.user.findMany({
    where: { role: 'BUYER' },
    take: 2,
  });

  if (buyers.length > 0 && products.length > 0) {
    const reviewComments = [
      'Great product! Exactly as described.',
      'High quality and fast delivery. Highly recommended!',
      'Love this item! Will definitely buy again.',
      'Good value for money. Satisfied with my purchase.',
      'Authentic local product. Supporting our community!',
    ];

    let reviewCount = 0;
    for (let i = 0; i < Math.min(10, products.length); i++) {
      const buyer = buyers[i % buyers.length];
      const product = products[i];
      const rating = Math.floor(Math.random() * 2) + 4; // 4 or 5 stars
      const comment = reviewComments[i % reviewComments.length];

      await prisma.review.create({
        data: {
          userId: buyer.id,
          productId: product.id,
          rating,
          comment,
        },
      });

      reviewCount++;
    }

    console.log(`✓ Created ${reviewCount} sample reviews\n`);
  } else {
    console.log('⚠️  No buyers found, skipping reviews\n');
  }

  // Create sample wishlist items
  console.log('❤️  Creating sample wishlist items...');

  if (buyers.length > 0 && products.length > 0) {
    let wishlistCount = 0;
    for (const buyer of buyers) {
      // Check existing wishlist items
      const existingWishlist = await prisma.wishlistItem.findMany({
        where: { userId: buyer.id },
      });

      if (existingWishlist.length > 0) {
        console.log(`  ℹ️  Buyer already has ${existingWishlist.length} wishlist items, skipping...`);
        continue;
      }

      // Add 3-5 random products to each buyer's wishlist
      const wishlistSize = Math.floor(Math.random() * 3) + 3;
      const randomProducts = products
        .sort(() => 0.5 - Math.random())
        .slice(0, wishlistSize);

      for (const product of randomProducts) {
        await prisma.wishlistItem.create({
          data: {
            userId: buyer.id,
            productId: product.id,
          },
        });
        wishlistCount++;
      }
    }

    console.log(`✓ Created ${wishlistCount} wishlist items\n`);
  }

  // Summary
  console.log('\n🎉 Seeding completed successfully!\n');
  console.log('📊 Summary:');
  console.log(`  - Stores: ${stores.length}`);
  console.log(`  - Products: ${productCount}`);
  console.log(`  - Categories used: ${Object.keys(PRODUCTS_DATA).length}`);
  console.log('\n💡 You can now test the shopping flow with real data!');
  console.log('\n� Admin accounts:');
  console.log('  - superadmin@emoorm.local / SuperAdmin@1234  [SUPER_ADMIN]');
  console.log('  - munadmin@emoorm.local   / MunAdmin@1234   [MUNICIPAL_ADMIN]');
  console.log('\n�📧 Seller accounts created:');
  for (let i = 0; i < STORES_DATA.length; i++) {
    console.log(`  - seller${i + 1}@emoorm.local / Test@1234`);
  }
  console.log('\n🚀 Start the frontend and browse products!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
