const { PrismaClient } = require('@prisma/client');

// Create a single Prisma Client instance
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['error', 'warn'] 
    : ['error'],
});

// Force connection on module load
prisma.$connect().then(() => {
  console.log('✅ Prisma connected');
}).catch((err) => {
  console.error('❌ Prisma connection failed:', err);
});

module.exports = prisma;
