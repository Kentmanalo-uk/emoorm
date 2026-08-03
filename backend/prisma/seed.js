const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const mariadb = require('mariadb');
require('dotenv').config();

// Create connection pool with more connection limit
const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'emoormdb',
  connectionLimit: 5,
  acquireTimeout: 30000,
});

// Create adapter
const adapter = new PrismaMariaDb(pool);

// Create Prisma Client instance
const prisma = new PrismaClient({ adapter });

/**
 * Municipalities of Oriental Mindoro, Philippines
 */
const municipalities = [
  {
    name: 'Baco',
    code: 'BACO',
  },
  {
    name: 'Bansud',
    code: 'BANSUD',
  },
  {
    name: 'Bongabong',
    code: 'BONGABONG',
  },
  {
    name: 'Bulalacao',
    code: 'BULALACAO',
  },
  {
    name: 'Calapan City',
    code: 'CALAPAN',
  },
  {
    name: 'Gloria',
    code: 'GLORIA',
  },
  {
    name: 'Mansalay',
    code: 'MANSALAY',
  },
  {
    name: 'Naujan',
    code: 'NAUJAN',
  },
  {
    name: 'Pinamalayan',
    code: 'PINAMALAYAN',
  },
  {
    name: 'Pola',
    code: 'POLA',
  },
  {
    name: 'Puerto Galera',
    code: 'PUERTO_GALERA',
  },
  {
    name: 'Roxas',
    code: 'ROXAS',
  },
  {
    name: 'San Teodoro',
    code: 'SAN_TEODORO',
  },
  {
    name: 'Socorro',
    code: 'SOCORRO',
  },
  {
    name: 'Victoria',
    code: 'VICTORIA',
  },
];

/**
 * Product Categories
 */
const categories = [
  {
    name: 'Fruits',
    slug: 'fruits',
    description: 'Fresh fruits from local farmers',
    icon: '🍎',
  },
  {
    name: 'Vegetables',
    slug: 'vegetables',
    description: 'Fresh vegetables from local farms',
    icon: '🥬',
  },
  {
    name: 'Rice',
    slug: 'rice',
    description: 'Locally grown rice varieties',
    icon: '🌾',
  },
  {
    name: 'Livestock',
    slug: 'livestock',
    description: 'Poultry, pork, beef, and other livestock products',
    icon: '🐄',
  },
  {
    name: 'Seafood',
    slug: 'seafood',
    description: 'Fresh catch from local waters',
    icon: '🐟',
  },
  {
    name: 'Processed Foods',
    slug: 'processed-foods',
    description: 'Locally processed food products',
    icon: '🥫',
  },
  {
    name: 'Handicrafts',
    slug: 'handicrafts',
    description: 'Traditional and modern handicrafts',
    icon: '🎨',
  },
  {
    name: 'Local Delicacies',
    slug: 'local-delicacies',
    description: 'Traditional local food specialties',
    icon: '🍰',
  },
  {
    name: 'Dried Goods',
    slug: 'dried-goods',
    description: 'Dried fish, fruits, and other preserved products',
    icon: '🌰',
  },
  {
    name: 'Beverages',
    slug: 'beverages',
    description: 'Local drinks and beverages',
    icon: '🥤',
  },
];

async function main() {
  console.log('🌱 Starting database seeding...');

  try {
    // Seed Municipalities
    console.log('\n📍 Seeding municipalities...');
    for (const municipality of municipalities) {
      const existing = await prisma.municipality.findUnique({
        where: { code: municipality.code },
      });

      if (!existing) {
        await prisma.municipality.create({
          data: municipality,
        });
        console.log(`   ✓ Created: ${municipality.name}`);
      } else {
        console.log(`   ⊙ Exists: ${municipality.name}`);
      }
    }

    // Seed Categories
    console.log('\n🏷️  Seeding categories...');
    for (const category of categories) {
      const existing = await prisma.category.findUnique({
        where: { slug: category.slug },
      });

      if (!existing) {
        await prisma.category.create({
          data: category,
        });
        console.log(`   ✓ Created: ${category.name}`);
      } else {
        console.log(`   ⊙ Exists: ${category.name}`);
      }
    }

    console.log('\n✅ Database seeding completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
