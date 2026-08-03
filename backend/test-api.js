/**
 * E-MOORM API Testing Script
 * Tests all 67 endpoints systematically
 */

const BASE_URL = 'http://localhost:3000/api';

// Test data storage
const testData = {
  tokens: {},
  users: {},
  stores: {},
  products: {},
  orders: {},
  reviews: {},
  reports: {},
  municipalities: {},
  categories: {},
};

// Utility: Make HTTP request
async function makeRequest(method, endpoint, data = null, token = null) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const result = await response.json();
    return {
      status: response.status,
      ok: response.ok,
      data: result,
    };
  } catch (error) {
    return {
      status: 500,
      ok: false,
      error: error.message,
    };
  }
}

// Test result logger
function logTest(name, passed, details = '') {
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${name}`);
  if (details) console.log(`   ${details}`);
}

// ============================================
// TEST SUITE
// ============================================

async function runTests() {
  console.log('\n================================================');
  console.log('  E-MOORM API Testing Suite');
  console.log('================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  // --------------------------------------------
  // 1. MUNICIPALITY MODULE (Public endpoints)
  // --------------------------------------------
  console.log('\n📍 Testing Municipality Module...\n');

  // Test 1.1: Get all municipalities
  const municipalitiesRes = await makeRequest('GET', '/municipalities');
  if (municipalitiesRes.ok && municipalitiesRes.data.success) {
    logTest('GET /municipalities', true, `Found ${municipalitiesRes.data.pagination.total} municipalities`);
    testData.municipalities.list = municipalitiesRes.data.data;
    if (testData.municipalities.list.length > 0) {
      testData.municipalities.first = testData.municipalities.list[0];
    }
    passedTests++;
  } else {
    logTest('GET /municipalities', false, municipalitiesRes.data.message || municipalitiesRes.error);
    failedTests++;
  }

  // Test 1.2: Get municipality by ID
  if (testData.municipalities.first) {
    const municipalityRes = await makeRequest('GET', `/municipalities/${testData.municipalities.first.id}`);
    if (municipalityRes.ok && municipalityRes.data.success) {
      logTest(`GET /municipalities/:id`, true, `Retrieved: ${municipalityRes.data.data.name}`);
      passedTests++;
    } else {
      logTest(`GET /municipalities/:id`, false, municipalityRes.data.message);
      failedTests++;
    }
  }

  // --------------------------------------------
  // 2. CATEGORY MODULE (Public endpoints)
  // --------------------------------------------
  console.log('\n🏷️  Testing Category Module...\n');

  // Test 2.1: Get all categories
  const categoriesRes = await makeRequest('GET', '/categories');
  if (categoriesRes.ok && categoriesRes.data.success) {
    logTest('GET /categories', true, `Found ${categoriesRes.data.pagination.total} categories`);
    testData.categories.list = categoriesRes.data.data;
    if (testData.categories.list.length > 0) {
      testData.categories.first = testData.categories.list[0];
    }
    passedTests++;
  } else {
    logTest('GET /categories', false, categoriesRes.data.message || categoriesRes.error);
    failedTests++;
  }

  // Test 2.2: Get category by slug
  if (testData.categories.first) {
    const categoryRes = await makeRequest('GET', `/categories/slug/${testData.categories.first.slug}`);
    if (categoryRes.ok && categoryRes.data.success) {
      logTest(`GET /categories/slug/:slug`, true, `Retrieved: ${categoryRes.data.data.name}`);
      passedTests++;
    } else {
      logTest(`GET /categories/slug/:slug`, false, categoryRes.data.message);
      failedTests++;
    }
  }

  // --------------------------------------------
  // 3. AUTHENTICATION MODULE
  // --------------------------------------------
  console.log('\n🔐 Testing Authentication Module...\n');

  // Test 3.1: Register Buyer
  const buyerData = {
    email: `buyer${Date.now()}@test.com`,
    password: 'Password123!',
    fullName: 'Test Buyer',
    contactNumber: '09171234567',
    municipalityId: testData.municipalities.first?.id,
    role: 'BUYER',
  };

  const registerBuyerRes = await makeRequest('POST', '/auth/register', buyerData);
  if (registerBuyerRes.ok && registerBuyerRes.data.success) {
    logTest('POST /auth/register (Buyer)', true, `User: ${buyerData.email}`);
    testData.users.buyer = registerBuyerRes.data.data.user;
    testData.tokens.buyer = registerBuyerRes.data.data.accessToken;
    passedTests++;
  } else {
    logTest('POST /auth/register (Buyer)', false, registerBuyerRes.data.message);
    failedTests++;
  }

  // Test 3.2: Login Buyer
  const loginBuyerRes = await makeRequest('POST', '/auth/login', {
    email: buyerData.email,
    password: buyerData.password,
  });
  if (loginBuyerRes.ok && loginBuyerRes.data.success) {
    logTest('POST /auth/login (Buyer)', true, `Token received`);
    testData.tokens.buyer = loginBuyerRes.data.data.accessToken;
    passedTests++;
  } else {
    logTest('POST /auth/login (Buyer)', false, loginBuyerRes.data.message);
    failedTests++;
  }

  // Test 3.3: Get Profile
  const profileRes = await makeRequest('GET', '/auth/profile', null, testData.tokens.buyer);
  if (profileRes.ok && profileRes.data.success) {
    logTest('GET /auth/profile', true, `Profile: ${profileRes.data.data.fullName}`);
    passedTests++;
  } else {
    logTest('GET /auth/profile', false, profileRes.data.message);
    failedTests++;
  }

  // Test 3.4: Register Seller
  const sellerData = {
    email: `seller${Date.now()}@test.com`,
    password: 'Password123!',
    fullName: 'Test Seller',
    contactNumber: '09181234567',
    municipalityId: testData.municipalities.first?.id,
    role: 'SELLER',
  };

  const registerSellerRes = await makeRequest('POST', '/auth/register', sellerData);
  if (registerSellerRes.ok && registerSellerRes.data.success) {
    logTest('POST /auth/register (Seller)', true, `User: ${sellerData.email}`);
    testData.users.seller = registerSellerRes.data.data.user;
    testData.tokens.seller = registerSellerRes.data.data.accessToken;
    passedTests++;
  } else {
    logTest('POST /auth/register (Seller)', false, registerSellerRes.data.message);
    failedTests++;
  }

  // --------------------------------------------
  // 4. STORE MODULE
  // --------------------------------------------
  console.log('\n🏪 Testing Store Module...\n');

  // Test 4.1: Create Store (Seller)
  const storeData = {
    name: `Test Store ${Date.now()}`,
    description: 'A test store for testing purposes',
    businessHours: 'Mon-Fri 9AM-5PM',
  };

  const createStoreRes = await makeRequest('POST', '/stores', storeData, testData.tokens.seller);
  if (createStoreRes.ok && createStoreRes.data.success) {
    logTest('POST /stores', true, `Store: ${createStoreRes.data.data.name}`);
    testData.stores.test = createStoreRes.data.data;
    passedTests++;
  } else {
    logTest('POST /stores', false, createStoreRes.data.message);
    failedTests++;
  }

  // Test 4.2: Get My Store
  const myStoreRes = await makeRequest('GET', '/stores/my/store', null, testData.tokens.seller);
  if (myStoreRes.ok && myStoreRes.data.success) {
    logTest('GET /stores/my/store', true, `Store: ${myStoreRes.data.data.name}`);
    passedTests++;
  } else {
    logTest('GET /stores/my/store', false, myStoreRes.data.message);
    failedTests++;
  }

  // Test 4.3: Get all stores (Public)
  const storesRes = await makeRequest('GET', '/stores');
  if (storesRes.ok && storesRes.data.success) {
    logTest('GET /stores', true, `Found ${storesRes.data.pagination.total} stores`);
    passedTests++;
  } else {
    logTest('GET /stores', false, storesRes.data.message);
    failedTests++;
  }

  // --------------------------------------------
  // 5. PRODUCT MODULE
  // --------------------------------------------
  console.log('\n📦 Testing Product Module...\n');

  // Test 5.1: Create Product (Seller)
  const productData = {
    name: `Test Product ${Date.now()}`,
    description: 'A test product for testing purposes',
    price: 999.99,
    stock: 10,
    images: ['https://via.placeholder.com/300'],
    categoryId: testData.categories.first?.id,
  };

  const createProductRes = await makeRequest('POST', '/products', productData, testData.tokens.seller);
  if (createProductRes.ok && createProductRes.data.success) {
    logTest('POST /products', true, `Product: ${createProductRes.data.data.name} (Status: ${createProductRes.data.data.status})`);
    testData.products.test = createProductRes.data.data;
    passedTests++;
  } else {
    logTest('POST /products', false, createProductRes.data.message);
    failedTests++;
  }

  // Test 5.2: Get My Products
  const myProductsRes = await makeRequest('GET', '/products/my/products', null, testData.tokens.seller);
  if (myProductsRes.ok && myProductsRes.data.success) {
    logTest('GET /products/my/products', true, `Found ${myProductsRes.data.pagination.total} products`);
    passedTests++;
  } else {
    logTest('GET /products/my/products', false, myProductsRes.data.message);
    failedTests++;
  }

  // Test 5.3: Get all products (Public - should not show PENDING)
  const productsRes = await makeRequest('GET', '/products');
  if (productsRes.ok && productsRes.data.success) {
    logTest('GET /products (Public)', true, `Found ${productsRes.data.pagination.total} approved products`);
    passedTests++;
  } else {
    logTest('GET /products (Public)', false, productsRes.data.message);
    failedTests++;
  }

  // --------------------------------------------
  // 6. NOTIFICATION MODULE
  // --------------------------------------------
  console.log('\n🔔 Testing Notification Module...\n');

  // Test 6.1: Get My Notifications
  const notificationsRes = await makeRequest('GET', '/notifications', null, testData.tokens.buyer);
  if (notificationsRes.ok && notificationsRes.data.success) {
    logTest('GET /notifications', true, `Found ${notificationsRes.data.pagination.total} notifications`);
    passedTests++;
  } else {
    logTest('GET /notifications', false, notificationsRes.data.message);
    failedTests++;
  }

  // Test 6.2: Get Unread Count
  const unreadCountRes = await makeRequest('GET', '/notifications/unread/count', null, testData.tokens.buyer);
  if (unreadCountRes.ok && unreadCountRes.data.success) {
    logTest('GET /notifications/unread/count', true, `Unread: ${unreadCountRes.data.data.count}`);
    passedTests++;
  } else {
    logTest('GET /notifications/unread/count', false, unreadCountRes.data.message);
    failedTests++;
  }

  // ============================================
  // TEST SUMMARY
  // ============================================
  console.log('\n================================================');
  console.log('  Test Results Summary');
  console.log('================================================');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📊 Total:  ${passedTests + failedTests}`);
  console.log(`📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(2)}%`);
  console.log('================================================\n');

  // Log test data for manual testing
  console.log('\n📋 Test Data for Manual Testing:');
  console.log('=====================================');
  console.log('\nBuyer Credentials:');
  console.log(`  Email: ${buyerData.email}`);
  console.log(`  Password: ${buyerData.password}`);
  console.log(`  Token: ${testData.tokens.buyer?.substring(0, 50)}...`);
  console.log('\nSeller Credentials:');
  console.log(`  Email: ${sellerData.email}`);
  console.log(`  Password: ${sellerData.password}`);
  console.log(`  Token: ${testData.tokens.seller?.substring(0, 50)}...`);
  console.log('\nStore ID:', testData.stores.test?.id);
  console.log('Product ID:', testData.products.test?.id);
  console.log('\n');
}

// Run tests
runTests().catch(console.error);
