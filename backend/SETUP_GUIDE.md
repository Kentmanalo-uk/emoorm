# E-MOORM Backend Complete Setup Guide

## 🎉 Backend Modules Completed

### ✅ Authentication Module
- User registration with validation
- Login with JWT tokens
- Token refresh mechanism
- Profile management
- Password change
- Seller application system
- Admin user management

### ✅ Municipality Module
- Get all municipalities
- Get municipality by ID or code
- Create municipality (Super Admin)
- Seed municipalities via API

### ✅ Category Module
- Get all categories
- Get category by ID or slug
- Create, update, delete categories (Super Admin)
- Toggle category status
- Seed categories via API

## 📊 Database Setup Instructions

### Method 1: Using phpMyAdmin (Recommended)

1. **Open phpMyAdmin**
   - Navigate to: http://localhost/phpmyadmin
   - Login (usually no password for Laragon)

2. **Select Database**
   - Click on `emoormdb` in the left sidebar

3. **Run Seed SQL**
   - Click on the "SQL" tab at the top
   - Copy the entire contents from `backend/src/database/seed.sql`
   - Paste into the SQL editor
   - Click "Go" button

4. **Verify Data**
   ```sql
   SELECT COUNT(*) FROM municipalities;  -- Should return 15
   SELECT COUNT(*) FROM categories;      -- Should return 10
   ```

### Method 2: Using API Endpoints (Alternative)

If you encounter connection pool issues with direct seeding, you can use the API endpoints:

1. **Start the server**
   ```bash
   npm run dev
   ```

2. **Seed Municipalities** (requires Super Admin token)
   ```bash
   POST http://localhost:3000/api/municipalities/seed
   Authorization: Bearer {super-admin-token}
   ```

3. **Seed Categories** (requires Super Admin token)
   ```bash
   POST http://localhost:3000/api/categories/seed
   Authorization: Bearer {super-admin-token}
   ```

**Note:** To get a Super Admin token, you'll need to:
- Create a user via registration
- Manually update their role in the database to 'SUPER_ADMIN'
- Login to get their token

### Method 3: Direct SQL via Laragon

1. **Open Terminal/Command Prompt**

2. **Navigate to Laragon MySQL bin**
   ```bash
   cd C:\laragon\bin\mysql\mysql-8.0.30-winx64\bin
   ```
   *(adjust version number if different)*

3. **Run MySQL CLI**
   ```bash
   mysql.exe -u root
   ```

4. **Execute Seed SQL**
   ```sql
   USE emoormdb;
   SOURCE C:/laragon/www/emoorm-app/emoorm/backend/src/database/seed.sql
   ```

## 🧪 Testing the API

### 1. Test Municipality Endpoints

**Get All Municipalities (Public)**
```http
GET http://localhost:3000/api/municipalities
```

Expected response:
```json
{
  "success": true,
  "message": "Municipalities retrieved successfully",
  "data": [
    {
      "id": "uuid-here",
      "name": "Calapan City",
      "code": "CALAPAN",
      "isActive": true
    },
    // ... more municipalities
  ]
}
```

**Get Municipality by ID (Public)**
```http
GET http://localhost:3000/api/municipalities/{municipalityId}
```

**Get Municipality by Code (Public)**
```http
GET http://localhost:3000/api/municipalities/code/CALAPAN
```

### 2. Test Category Endpoints

**Get All Categories (Public)**
```http
GET http://localhost:3000/api/categories
```

Expected response:
```json
{
  "success": true,
  "message": "Categories retrieved successfully",
  "data": [
    {
      "id": "uuid-here",
      "name": "Fruits",
      "slug": "fruits",
      "description": "Fresh fruits from local farmers",
      "icon": "🍎",
      "isActive": true
    },
    // ... more categories
  ]
}
```

**Get Category by Slug (Public)**
```http
GET http://localhost:3000/api/categories/slug/fruits
```

### 3. Test Authentication Flow

**Step 1: Get Municipality ID**
```http
GET http://localhost:3000/api/municipalities
```
Copy any municipality `id` from the response.

**Step 2: Register User**
```http
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "<see backend/prisma/seed.js — local defaults, override with SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD>",
  "confirmPassword": "<see backend/prisma/seed.js — local defaults, override with SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD>",
  "fullName": "Test User",
  "contactNumber": "09123456789",
  "municipalityId": "PASTE-MUNICIPALITY-ID-HERE",
  "barangay": "Poblacion",
  "address": "123 Test Street"
}
```

**Step 3: Login**
```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "<see backend/prisma/seed.js — local defaults, override with SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD>"
}
```

Save the `accessToken` from the response.

**Step 4: Get Profile**
```http
GET http://localhost:3000/api/auth/profile
Authorization: Bearer {your-access-token}
```

## 📋 Complete API Endpoint List

### Public Endpoints (No Authentication Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |
| GET | `/api` | API information |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/refresh-token` | Refresh access token |
| GET | `/api/municipalities` | Get all municipalities |
| GET | `/api/municipalities/:id` | Get municipality by ID |
| GET | `/api/municipalities/code/:code` | Get municipality by code |
| GET | `/api/categories` | Get all categories |
| GET | `/api/categories/:id` | Get category by ID |
| GET | `/api/categories/slug/:slug` | Get category by slug |

### Protected Endpoints (Authentication Required)

**User Endpoints**
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/logout` | Any | Logout user |
| GET | `/api/auth/profile` | Any | Get current user profile |
| PUT | `/api/auth/profile` | Any | Update user profile |
| POST | `/api/auth/change-password` | Any | Change password |
| POST | `/api/auth/apply-seller` | BUYER | Apply to become seller |

**Admin User Management**
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/auth/users` | ADMIN | Get all users with filters |
| GET | `/api/auth/users/:id` | ADMIN | Get user by ID |
| POST | `/api/auth/users/:id/approve-seller` | ADMIN | Approve seller application |
| POST | `/api/auth/users/:id/reject-seller` | ADMIN | Reject seller application |
| POST | `/api/auth/users/:id/suspend` | ADMIN | Suspend user account |
| POST | `/api/auth/users/:id/activate` | ADMIN | Activate user account |
| DELETE | `/api/auth/users/:id` | SUPER_ADMIN | Delete user |

**Municipality Management**
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/municipalities` | SUPER_ADMIN | Create municipality |
| POST | `/api/municipalities/seed` | SUPER_ADMIN | Seed municipalities |

**Category Management**
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/categories` | SUPER_ADMIN | Create category |
| PUT | `/api/categories/:id` | SUPER_ADMIN | Update category |
| DELETE | `/api/categories/:id` | SUPER_ADMIN | Delete category |
| POST | `/api/categories/:id/toggle` | SUPER_ADMIN | Toggle category status |
| POST | `/api/categories/seed` | SUPER_ADMIN | Seed categories |

## 🔧 Troubleshooting

### Connection Pool Timeout

**Problem**: `pool timeout: failed to retrieve a connection from pool`

**Solutions**:
1. **Check MySQL is running in Laragon**
   - Open Laragon control panel
   - Ensure MySQL service is started (green icon)

2. **Verify database exists**
   - Open phpMyAdmin
   - Check if `emoormdb` database exists
   - If not, create it: `CREATE DATABASE emoormdb;`

3. **Check database credentials**
   - Open `.env` file
   - Verify: `DB_USER=root`, `DB_PASSWORD=` (empty), `DB_NAME=emoormdb`

4. **Restart the server**
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

5. **Test connection independently**
   ```bash
   node -e "const prisma = require('./src/config/database'); console.log('Testing...'); process.exit(0)"
   ```

### Tables Don't Exist

**Problem**: `Table 'emoormdb.municipalities' doesn't exist`

**Solution**:
```bash
# Run migrations
npx prisma migrate dev

# Or push schema
npx prisma db push
```

### Module Not Found

**Problem**: `Cannot find module '...'`

**Solution**:
```bash
# Reinstall dependencies
npm install
```

### Port Already in Use

**Problem**: `Error: listen EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Find and kill process using port 3000
netstat -ano | findstr :3000
taskkill /PID {process-id} /F

# Or use different port in .env
PORT=3001
```

## 📝 Environment Variables

Create/Update `.env` file:

```env
# Node Environment
NODE_ENV=development

# Server
PORT=3000
API_PREFIX=/api

# Database (MySQL via Laragon)
DATABASE_URL="mariadb://root:@localhost:3306/emoormdb"
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=emoormdb

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-super-secret-refresh-token-key-change-this
JWT_REFRESH_EXPIRES_IN=30d

# Bcrypt
BCRYPT_ROUNDS=10

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:19006
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:19006,http://localhost:8081
```

## 🚀 Next Development Steps

Now that Authentication, Municipality, and Category modules are complete, you can build:

### 1. Store Module
- Create store (for sellers)
- View store details
- Update store information
- Store management

### 2. Product Module
- Create products
- List products with filters
- Product details
- Update/delete products
- Product search
- Municipality-scoped products

### 3. Shopping Cart Module
- Add to cart
- Update quantities
- Remove from cart
- View cart

### 4. Order Module
- Checkout process
- Order creation
- Order status updates
- Order history
- Order tracking

### 5. Review Module
- Submit product reviews
- View product reviews
- Review moderation

### 6. Notification Module
- Real-time notifications
- Notification preferences
- Mark as read

## 📚 Additional Resources

- **Prisma Documentation**: https://www.prisma.io/docs
- **Express.js Guide**: https://expressjs.com/
- **JWT Best Practices**: https://jwt.io/introduction
- **MySQL Documentation**: https://dev.mysql.com/doc/

---

**E-MOORM Backend** - v1.0.0
Built with ❤️ for Oriental Mindoro
