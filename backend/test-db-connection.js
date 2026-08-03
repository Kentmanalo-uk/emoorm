/**
 * Test Database Connection
 * Tests if we can connect to MySQL via mariadb driver
 */

const mariadb = require('mariadb');
require('dotenv').config();

async function testConnection() {
  console.log('🔍 Testing database connection...\n');
  
  console.log('Configuration:');
  console.log('  Host:', process.env.DB_HOST || 'localhost');
  console.log('  Port:', process.env.DB_PORT || '3306');
  console.log('  User:', process.env.DB_USER || 'root');
  console.log('  Password:', process.env.DB_PASSWORD ? '***' : '(empty)');
  console.log('  Database:', process.env.DB_NAME || 'emoormdb');
  console.log('');

  let connection;
  
  try {
    console.log('⏳ Creating connection...');
    
    // Try to create a single connection (not pool)
    connection = await mariadb.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'emoormdb',
    });
    
    console.log('✅ Connection successful!\n');
    
    // Test a simple query
    console.log('⏳ Testing query...');
    const result = await connection.query('SELECT 1 as test');
    console.log('✅ Query successful:', result);
    console.log('');
    
    // Check if municipalities table exists
    console.log('⏳ Checking municipalities table...');
    const tables = await connection.query("SHOW TABLES LIKE 'municipalities'");
    if (tables.length > 0) {
      console.log('✅ municipalities table exists');
      
      const count = await connection.query('SELECT COUNT(*) as count FROM municipalities');
      console.log(`   Found ${count[0].count} municipalities`);
    } else {
      console.log('❌ municipalities table does NOT exist');
      console.log('   Run: npx prisma db push');
    }
    console.log('');
    
    // Check if categories table exists
    console.log('⏳ Checking categories table...');
    const catTables = await connection.query("SHOW TABLES LIKE 'categories'");
    if (catTables.length > 0) {
      console.log('✅ categories table exists');
      
      const count = await connection.query('SELECT COUNT(*) as count FROM categories');
      console.log(`   Found ${count[0].count} categories`);
    } else {
      console.log('❌ categories table does NOT exist');
      console.log('   Run: npx prisma db push');
    }
    
  } catch (error) {
    console.error('❌ Connection failed!\n');
    console.error('Error:', error.message);
    console.error('');
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('🔒 Access Denied - Check your database credentials in .env');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Connection Refused - Is MySQL running in Laragon?');
      console.error('   1. Open Laragon');
      console.error('   2. Click "Start All"');
      console.error('   3. Verify MySQL is running (green icon)');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('🗄️  Database does not exist');
      console.error('   Create it in phpMyAdmin or run:');
      console.error('   CREATE DATABASE emoormdb;');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✅ Connection closed.');
    }
  }
}

testConnection();
