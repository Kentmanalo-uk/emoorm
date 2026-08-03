/**
 * Authentication Endpoint Test Script
 * Tests register and login functionality
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

// Test data
const testUser = {
  email: 'john.doe@example.com',
  password: 'Test@1234',
  confirmPassword: 'Test@1234',
  fullName: 'John Doe',
  contactNumber: '09123456789',
  municipalityId: '', // Will be filled after getting municipalities
  barangay: 'Poblacion',
  address: '123 Main Street',
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

async function testRegister() {
  try {
    log('\n📝 Testing User Registration...', 'blue');
    
    const response = await axios.post(`${BASE_URL}/auth/register`, testUser);
    
    if (response.data.success) {
      log('✅ Registration successful!', 'green');
      console.log('User:', response.data.data.user);
      console.log('Access Token:', response.data.data.accessToken.substring(0, 20) + '...');
      return response.data.data;
    }
  } catch (error) {
    if (error.response) {
      log('❌ Registration failed:', 'red');
      console.log('Status:', error.response.status);
      console.log('Message:', error.response.data.message);
      console.log('Errors:', error.response.data.errors);
    } else {
      log('❌ Network error:', 'red');
      console.log(error.message);
    }
    return null;
  }
}

async function testLogin() {
  try {
    log('\n🔐 Testing User Login...', 'blue');
    
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: testUser.email,
      password: testUser.password,
    });
    
    if (response.data.success) {
      log('✅ Login successful!', 'green');
      console.log('User:', response.data.data.user);
      console.log('Access Token:', response.data.data.accessToken.substring(0, 20) + '...');
      return response.data.data;
    }
  } catch (error) {
    if (error.response) {
      log('❌ Login failed:', 'red');
      console.log('Status:', error.response.status);
      console.log('Message:', error.response.data.message);
    } else {
      log('❌ Network error:', 'red');
      console.log(error.message);
    }
    return null;
  }
}

async function testGetProfile(accessToken) {
  try {
    log('\n👤 Testing Get Profile...', 'blue');
    
    const response = await axios.get(`${BASE_URL}/auth/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    if (response.data.success) {
      log('✅ Profile retrieved successfully!', 'green');
      console.log('User:', response.data.data);
      return response.data.data;
    }
  } catch (error) {
    if (error.response) {
      log('❌ Get profile failed:', 'red');
      console.log('Status:', error.response.status);
      console.log('Message:', error.response.data.message);
    } else {
      log('❌ Network error:', 'red');
      console.log(error.message);
    }
    return null;
  }
}

async function testRefreshToken(refreshToken) {
  try {
    log('\n🔄 Testing Token Refresh...', 'blue');
    
    const response = await axios.post(`${BASE_URL}/auth/refresh-token`, {
      refreshToken,
    });
    
    if (response.data.success) {
      log('✅ Token refreshed successfully!', 'green');
      console.log('New Access Token:', response.data.data.accessToken.substring(0, 20) + '...');
      return response.data.data;
    }
  } catch (error) {
    if (error.response) {
      log('❌ Token refresh failed:', 'red');
      console.log('Status:', error.response.status);
      console.log('Message:', error.response.data.message);
    } else {
      log('❌ Network error:', 'red');
      console.log(error.message);
    }
    return null;
  }
}

async function getMunicipalities() {
  try {
    log('\n🏙️  Fetching Municipalities...', 'blue');
    
    // We need to create a municipality endpoint or use direct DB query
    // For now, we'll use a hardcoded UUID that should exist after seeding
    log('⚠️  Using a test municipality ID. Please ensure municipalities are seeded.', 'yellow');
    
    // Return a placeholder - in production this would fetch from DB
    return null;
  } catch (error) {
    log('❌ Failed to fetch municipalities:', 'red');
    console.log(error.message);
    return null;
  }
}

async function runTests() {
  log('='.repeat(60), 'blue');
  log('E-MOORM Authentication Endpoint Tests', 'blue');
  log('='.repeat(60), 'blue');
  
  // Check if server is running
  try {
    await axios.get(`${BASE_URL}/health`);
    log('✅ Server is running\n', 'green');
  } catch (error) {
    log('❌ Server is not running. Please start the server first.', 'red');
    process.exit(1);
  }
  
  // Get municipalities
  await getMunicipalities();
  
  // For testing, let's use a UUID
  // You should replace this with an actual municipality ID from your database
  log('\n⚠️  Note: Please set a valid municipalityId before running this test.', 'yellow');
  log('You can get municipality IDs from phpMyAdmin or by querying the municipalities table.\n', 'yellow');
  
  if (!testUser.municipalityId) {
    log('❌ Please set testUser.municipalityId in the script before running.', 'red');
    log('Example: Run this SQL in phpMyAdmin:', 'yellow');
    log('SELECT id, name FROM municipalities LIMIT 1;', 'yellow');
    return;
  }
  
  // Test 1: Register
  const registerResult = await testRegister();
  if (!registerResult) {
    log('\n⚠️  Registration failed. If user already exists, continuing with login test...', 'yellow');
  }
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Test 2: Login
  const loginResult = await testLogin();
  if (!loginResult) {
    log('\n❌ Login failed. Cannot continue with authenticated tests.', 'red');
    return;
  }
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Test 3: Get Profile
  await testGetProfile(loginResult.accessToken);
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Test 4: Refresh Token
  await testRefreshToken(loginResult.refreshToken);
  
  log('\n' + '='.repeat(60), 'blue');
  log('Tests Completed!', 'blue');
  log('='.repeat(60) + '\n', 'blue');
}

// Run tests
runTests().catch(console.error);
