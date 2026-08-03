const prisma = require('./src/config/database');

async function testConnection() {
  try {
    console.log('Testing Prisma connection...');
    
    // Test 1: Simple query
    console.log('\n1. Testing Municipality count...');
    const municipalityCount = await prisma.municipality.count();
    console.log(`✅ Municipalities: ${municipalityCount}`);
    
    // Test 2: Fetch data
    console.log('\n2. Testing Municipality findMany...');
    const municipalities = await prisma.municipality.findMany({
      take: 3,
    });
    console.log(`✅ Found ${municipalities.length} municipalities:`);
    municipalities.forEach(m => console.log(`   - ${m.name} (${m.code})`));
    
    // Test 3: Category count
    console.log('\n3. Testing Category count...');
    const categoryCount = await prisma.category.count();
    console.log(`✅ Categories: ${categoryCount}`);
    
    // Test 4: User count
    console.log('\n4. Testing User count...');
    const userCount = await prisma.user.count();
    console.log(`✅ Users: ${userCount}`);
    
    console.log('\n✅ All tests passed! Database connection is working.\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error code:', error.code);
    console.error('\nFull error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testConnection();
