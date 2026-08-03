/**
 * Test controller directly without Express
 */

const municipalityService = require('./src/services/municipality.service');

async function test() {
  try {
    console.log('Testing municipality service directly...\n');
    
    const result = await municipalityService.getAllMunicipalities({
      page: 1,
      pageSize: 5,
    });
    
    console.log('✅ Success!');
    console.log('Result:', JSON.stringify(result, null, 2).substring(0, 500));
    console.log(`Found ${result.total} municipalities`);
    console.log('\nFirst 3:');
    if (result.municipalities && result.municipalities.length > 0) {
      result.municipalities.slice(0, 3).forEach(m => {
        console.log(`  - ${m.name} (${m.code})`);
      });
    } else {
      console.log('  No municipalities found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

test();
