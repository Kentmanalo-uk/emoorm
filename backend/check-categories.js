const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.category.findMany();
  console.log('\n📂 Existing Categories:');
  categories.forEach(cat => {
    console.log(`  - ${cat.name} (${cat.slug})`);
  });
  console.log('');
}

main()
  .finally(() => prisma.$disconnect());
