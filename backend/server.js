require('dotenv').config();
const app = require('./src/app');
const config = require('./src/config/env');
const prisma = require('./src/config/database');

const PORT = config.port;

// Test database connection
const testDatabaseConnection = async () => {
  try {
    await prisma.$connect();
    console.log('✓ Database connected successfully');
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await testDatabaseConnection();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log('================================================');
      console.log('  E-MOORM Backend Server');
      console.log('================================================');
      console.log(`  Environment: ${config.nodeEnv}`);
      console.log(`  Port: ${PORT}`);
      console.log(`  API Base: http://localhost:${PORT}${config.apiPrefix}`);
      console.log('================================================');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
startServer();
