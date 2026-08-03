# E-MOORM Authentication Setup Guide

## 🎯 Overview

The authentication module has been successfully implemented with complete user management, JWT-based authentication, and role-based access control.

## ✅ Completed Features

### 1. Database Schema
- All tables created via Prisma migrations
- User, Municipality, Store, Product, Order, and related tables
- Soft delete support
- Municipality-scoped data architecture

### 2. Authentication System
- **Registration**: New user signup with validation
- **Login**: Email/password authentication with JWT
- **Token Refresh**: Automatic token renewal
- **Profile Management**: View and update user profile
- **Password Management**: Secure password change
- **Seller Application**: Buyers can apply to become sellers

### 3. Authorization & Security
- JWT token generation and verification
- Password hashing with bcrypt (10 rounds)
- Role-based access control (BUYER, SELLER, MUNICIPAL_ADMIN, SUPER_ADMIN)
- Municipality-scoped data access
- Store ownership verification
- Input validation with express-validator

### 4. Admin Features
- View all users with filters
- Approve/reject seller applications
- Suspend/activate user accounts
- Delete users (soft delete)
- Municipality-based user management

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js          # Prisma client with MariaDB adapter
│   │   └── env.js                # Environment configuration
│   ├── controllers/
│   │   └── auth.controller.js    # HTTP request handlers
│   ├── middleware/
│   │   ├── auth.js               # Authentication & authorization
│   │   ├── errorHandler.js       # Global error handling
│   │   └── validate.js           # Validation middleware
│   ├── repositories/
│   │   ├── user.repository.js    # User database operations
│   │   └── municipality.repository.js
│   ├── routes/
│   │   ├── index.js              # Main router
│   │   └── auth.routes.js        # Auth endpoints
│   ├── services/
│   │   └── auth.service.js       # Business logic
│   ├── utils/
│   │   ├── jwt.js                # JWT utilities
│   │   ├── password.js           # Password hashing
│   │   └── response.js           # Standard API responses
│   └── validators/
│       └── auth.validator.js     # Request validation rules
├── prisma/
│   ├── schema.prisma             # Database schema
│   ├── migrations/               # Database migrations
│   └── seed.js                   # Seed script
└── src/database/
    └── seed.sql                  # Direct SQL seed data
```

## 🔌 API Endpoints

### Public Endpoints

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password@123",
  "confirmPassword": "Password@123",
  "fullName": "John Doe",
  "contactNumber": "09123456789",
  "municipalityId": "uuid-here",
  "barangay": "Poblacion",
  "address": "123 Main St"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password@123"
}
```

#### Refresh Token
```http
POST /api/auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "your-refresh-token"
}
```

### Protected Endpoints (Require Authentication)

#### Get Profile
```http
GET /api/auth/profile
Authorization: Bearer {access-token}
```

#### Update Profile
```http
PUT /api/auth/profile
Authorization: Bearer {access-token}
Content-Type: application/json

{
  "fullName": "John Updated",
  "contactNumber": "09987654321",
  "address": "New Address"
}
```

#### Change Password
```http
POST /api/auth/change-password
Authorization: Bearer {access-token}
Content-Type: application/json

{
  "currentPassword": "OldPass@123",
  "newPassword": "NewPass@123",
  "confirmPassword": "NewPass@123"
}
```

#### Apply for Seller (BUYER only)
```http
POST /api/auth/apply-seller
Authorization: Bearer {access-token}
```

### Admin Endpoints

#### Get All Users
```http
GET /api/auth/users?page=1&pageSize=20&role=BUYER&search=john
Authorization: Bearer {admin-token}
```

#### Get User by ID
```http
GET /api/auth/users/{userId}
Authorization: Bearer {admin-token}
```

#### Approve Seller Application
```http
POST /api/auth/users/{userId}/approve-seller
Authorization: Bearer {admin-token}
```

#### Reject Seller Application
```http
POST /api/auth/users/{userId}/reject-seller
Authorization: Bearer {admin-token}
```

#### Suspend User
```http
POST /api/auth/users/{userId}/suspend
Authorization: Bearer {admin-token}
```

#### Activate User
```http
POST /api/auth/users/{userId}/activate
Authorization: Bearer {admin-token}
```

#### Delete User
```http
DELETE /api/auth/users/{userId}
Authorization: Bearer {super-admin-token}
```

## 🌱 Database Setup

### 1. Run Migrations
```bash
npx prisma migrate dev
```

### 2. Seed Database

**Option A: Using SQL (Recommended)**
1. Open phpMyAdmin: http://localhost/phpmyadmin
2. Select `emoormdb` database
3. Go to SQL tab
4. Copy contents from `backend/src/database/seed.sql`
5. Click "Go"

**Option B: Using Prisma (if connection works)**
```bash
npm run seed
```

### 3. Verify Data
Check that municipalities and categories are populated:
```sql
SELECT * FROM municipalities;
SELECT * FROM categories;
```

## 🧪 Testing Authentication

### Manual Testing with test-auth.js

1. **Get a Municipality ID:**
```sql
SELECT id, name FROM municipalities LIMIT 1;
```

2. **Update test-auth.js:**
```javascript
const testUser = {
  // ... other fields
  municipalityId: 'YOUR-MUNICIPALITY-UUID-HERE',
};
```

3. **Run Tests:**
```bash
node test-auth.js
```

### Testing with Postman/Thunder Client

1. **Register a User:**
   - Method: POST
   - URL: http://localhost:3000/api/auth/register
   - Body: See Register endpoint above

2. **Login:**
   - Method: POST
   - URL: http://localhost:3000/api/auth/login
   - Save the `accessToken` from response

3. **Get Profile:**
   - Method: GET
   - URL: http://localhost:3000/api/auth/profile
   - Headers: `Authorization: Bearer {accessToken}`

## 🔐 Security Features

- ✅ Password hashing with bcrypt
- ✅ JWT token authentication
- ✅ Role-based authorization
- ✅ Municipality-scoped access
- ✅ Input validation and sanitization
- ✅ SQL injection prevention (Prisma)
- ✅ CORS configuration
- ✅ Secure password requirements
- ✅ Soft deletes (data retention)

## 📝 Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (!@#$%^&*(),.?":{}|<>)

## 🚀 Running the Server

### Development Mode (with auto-restart)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

Server will be available at:
- API Base: http://localhost:3000/api
- Health Check: http://localhost:3000/api/health

## 📊 Database Connection

The backend uses:
- **Database**: MySQL (emoormdb)
- **Host**: localhost:3306
- **User**: root
- **Driver**: MariaDB adapter for Prisma 7.x

## 🐛 Troubleshooting

### Connection Pool Timeout
If you encounter pool timeout errors:
1. Ensure MySQL is running in Laragon
2. Check database credentials in `.env`
3. Verify database `emoormdb` exists
4. Restart the server

### Migration Issues
```bash
# Reset database (CAUTION: deletes all data)
npx prisma migrate reset

# Or push schema without migration
npx prisma db push
```

### JWT Token Expired
- Tokens expire after 7 days (access token)
- Use refresh token endpoint to get new tokens
- Implement auto-refresh in frontend

## 📚 Next Steps

### Immediate
1. Seed municipalities using phpMyAdmin
2. Test registration with a real municipality ID
3. Create first admin user manually or via SQL

### Future Features
- [ ] Email verification
- [ ] Forgot password / Reset password via email
- [ ] Two-factor authentication
- [ ] OAuth integration (Google, Facebook)
- [ ] Rate limiting
- [ ] Token blacklisting for logout
- [ ] Audit logging
- [ ] Real-time notifications

## 🎓 Code Standards

- Clean architecture (Repository → Service → Controller)
- Async/await for all async operations
- Comprehensive error handling
- Standardized API responses
- Input validation on all endpoints
- TypeScript-style JSDoc comments

## 👥 User Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| BUYER | Default user | Browse, purchase, review, apply for seller |
| SELLER | Approved merchant | Buyer permissions + manage store/products |
| MUNICIPAL_ADMIN | Local administrator | Manage users/sellers in assigned municipality |
| SUPER_ADMIN | System administrator | Full platform access |

## 📧 Support

For issues or questions, refer to:
- Main documentation: `APP_CONTEXT.md`
- Backend README: `README.md`
- API documentation: This file

---

**E-MOORM** - Empowering Oriental Mindoro's Local Economy 🌾
