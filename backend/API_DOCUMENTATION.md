# E-MOORM Backend API Documentation

Complete API documentation for the E-MOORM e-commerce platform backend.

**Base URL:** `http://localhost:5000/api`

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Municipalities](#2-municipalities)
3. [Categories](#3-categories)
4. [Stores](#4-stores)
5. [Products](#5-products)
6. [Orders](#6-orders)
7. [Reviews](#7-reviews)
8. [Reports](#8-reports)
9. [Notifications](#9-notifications)

---

## 1. Authentication

### Register
- **POST** `/auth/register`
- **Access:** Public
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "Password123!",
    "fullName": "John Doe",
    "contactNumber": "09171234567",
    "municipalityId": "uuid",
    "role": "BUYER"
  }
  ```

### Login
- **POST** `/auth/login`
- **Access:** Public
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "Password123!"
  }
  ```

### Get Profile
- **GET** `/auth/profile`
- **Access:** Private (All authenticated users)
- **Headers:** `Authorization: Bearer <token>`

### Update Profile
- **PUT** `/auth/profile`
- **Access:** Private (All authenticated users)
- **Body:**
  ```json
  {
    "fullName": "John Smith",
    "contactNumber": "09171234567"
  }
  ```

### Change Password
- **PUT** `/auth/change-password`
- **Access:** Private (All authenticated users)
- **Body:**
  ```json
  {
    "currentPassword": "OldPassword123!",
    "newPassword": "NewPassword123!"
  }
  ```

### Apply to Become Seller
- **POST** `/auth/apply-seller`
- **Access:** Private (Buyers only)

### Get All Users (Admin)
- **GET** `/auth/users?page=1&pageSize=20&role=BUYER`
- **Access:** Private (Admin only)

### Get User by ID (Admin)
- **GET** `/auth/users/:id`
- **Access:** Private (Admin only)

### Update User Role (Admin)
- **PUT** `/auth/users/:id/role`
- **Access:** Private (Super Admin only)
- **Body:**
  ```json
  {
    "role": "SELLER"
  }
  ```

### Suspend User (Admin)
- **POST** `/auth/users/:id/suspend`
- **Access:** Private (Admin only)

### Unsuspend User (Admin)
- **POST** `/auth/users/:id/unsuspend`
- **Access:** Private (Admin only)

---

## 2. Municipalities

### Get All Municipalities
- **GET** `/municipalities?page=1&pageSize=20&search=Calapan`
- **Access:** Public

### Get Municipality by ID
- **GET** `/municipalities/:id`
- **Access:** Public

### Get Municipality by Code
- **GET** `/municipalities/code/:code`
- **Access:** Public

### Create Municipality (Admin)
- **POST** `/municipalities`
- **Access:** Private (Admin only)
- **Body:**
  ```json
  {
    "name": "Calapan City",
    "code": "CALAPAN"
  }
  ```

### Update Municipality (Admin)
- **PUT** `/municipalities/:id`
- **Access:** Private (Admin only)

### Delete Municipality (Admin)
- **DELETE** `/municipalities/:id`
- **Access:** Private (Admin only)

---

## 3. Categories

### Get All Categories
- **GET** `/categories?page=1&pageSize=20`
- **Access:** Public

### Get Category by ID
- **GET** `/categories/:id`
- **Access:** Public

### Get Category by Slug
- **GET** `/categories/slug/:slug`
- **Access:** Public

### Create Category (Admin)
- **POST** `/categories`
- **Access:** Private (Admin only)
- **Body:**
  ```json
  {
    "name": "Electronics",
    "description": "Electronic devices and gadgets",
    "icon": "📱"
  }
  ```

### Update Category (Admin)
- **PUT** `/categories/:id`
- **Access:** Private (Admin only)

### Delete Category (Admin)
- **DELETE** `/categories/:id`
- **Access:** Private (Admin only)

---

## 4. Stores

### Get All Stores
- **GET** `/stores?page=1&pageSize=20&municipalityId=uuid&search=shop`
- **Access:** Public

### Get Store by ID
- **GET** `/stores/:id`
- **Access:** Public

### Get Store by Slug
- **GET** `/stores/slug/:slug`
- **Access:** Public

### Create Store (Seller)
- **POST** `/stores`
- **Access:** Private (Seller only)
- **Body:**
  ```json
  {
    "name": "My Store",
    "description": "Store description",
    "logo": "https://example.com/logo.png",
    "coverImage": "https://example.com/cover.png",
    "businessHours": "Mon-Fri 9AM-5PM"
  }
  ```

### Get My Store (Seller)
- **GET** `/stores/my/store`
- **Access:** Private (Seller only)

### Update Store (Owner)
- **PUT** `/stores/:id`
- **Access:** Private (Store owner only)

### Delete Store (Owner)
- **DELETE** `/stores/:id`
- **Access:** Private (Store owner only)

### Suspend Store (Admin)
- **POST** `/stores/:id/suspend`
- **Access:** Private (Admin only)

### Unsuspend Store (Admin)
- **POST** `/stores/:id/unsuspend`
- **Access:** Private (Admin only)

---

## 5. Products

### Get All Products
- **GET** `/products?page=1&pageSize=20&categoryId=uuid&storeId=uuid&minPrice=100&maxPrice=1000&search=phone`
- **Access:** Public (shows only APPROVED products)

### Get Product by ID
- **GET** `/products/:id`
- **Access:** Public

### Get Product by Slug
- **GET** `/products/slug/:slug`
- **Access:** Public

### Create Product (Seller)
- **POST** `/products`
- **Access:** Private (Seller only)
- **Body:**
  ```json
  {
    "name": "iPhone 15",
    "description": "Latest iPhone model",
    "price": 55000,
    "stock": 10,
    "images": ["url1", "url2"],
    "categoryId": "uuid"
  }
  ```

### Get My Products (Seller)
- **GET** `/products/my/products?page=1&pageSize=20&status=PENDING`
- **Access:** Private (Seller only)

### Update Product (Owner)
- **PUT** `/products/:id`
- **Access:** Private (Product owner only)

### Delete Product (Owner)
- **DELETE** `/products/:id`
- **Access:** Private (Product owner only)

### Approve Product (Admin)
- **POST** `/products/:id/approve`
- **Access:** Private (Admin only)

### Suspend Product (Admin)
- **POST** `/products/:id/suspend`
- **Access:** Private (Admin only)

### Archive Product (Admin)
- **POST** `/products/:id/archive`
- **Access:** Private (Admin only)

---

## 6. Orders

### Create Order (Checkout)
- **POST** `/orders`
- **Access:** Private (Buyer/Seller)
- **Body:**
  ```json
  {
    "storeId": "uuid",
    "items": [
      {
        "productId": "uuid",
        "quantity": 2
      }
    ],
    "deliveryAddress": "123 Main St, Calapan City",
    "notes": "Please deliver in the morning"
  }
  ```

### Get My Orders (Buyer)
- **GET** `/orders/my/orders?page=1&pageSize=20&status=PENDING`
- **Access:** Private (Buyer/Seller)

### Get Store Orders (Seller)
- **GET** `/orders/store/orders?page=1&pageSize=20&status=CONFIRMED`
- **Access:** Private (Seller only)

### Get All Orders (Admin)
- **GET** `/orders?page=1&pageSize=20&municipalityId=uuid`
- **Access:** Private (Admin only)

### Get Order by ID
- **GET** `/orders/:id`
- **Access:** Private (Buyer, Seller, or Admin)

### Update Order Status (Seller)
- **PUT** `/orders/:id/status`
- **Access:** Private (Seller only)
- **Body:**
  ```json
  {
    "status": "CONFIRMED"
  }
  ```
- **Valid Status Transitions:**
  - PENDING → CONFIRMED, CANCELLED
  - CONFIRMED → PREPARING, CANCELLED
  - PREPARING → READY, CANCELLED
  - READY → COMPLETED, CANCELLED

### Cancel Order (Buyer)
- **POST** `/orders/:id/cancel`
- **Access:** Private (Buyer/Seller)

---

## 7. Reviews

### Get Product Reviews
- **GET** `/reviews/product/:productId?page=1&pageSize=20&rating=5`
- **Access:** Public
- **Response includes:**
  - Reviews array
  - Rating statistics (average rating, total reviews)

### Get Review by ID
- **GET** `/reviews/:id`
- **Access:** Public

### Create Review (Buyer)
- **POST** `/reviews`
- **Access:** Private (Buyer/Seller who purchased the product)
- **Body:**
  ```json
  {
    "productId": "uuid",
    "rating": 5,
    "comment": "Great product!"
  }
  ```

### Get My Reviews (Buyer)
- **GET** `/reviews/my/reviews?page=1&pageSize=20`
- **Access:** Private (Buyer/Seller)

### Update Review (Owner)
- **PUT** `/reviews/:id`
- **Access:** Private (Review owner only)

### Delete Review
- **DELETE** `/reviews/:id`
- **Access:** Private (Review owner or Admin)

---

## 8. Reports

### Create Report
- **POST** `/reports`
- **Access:** Private (All authenticated users)
- **Body:**
  ```json
  {
    "type": "PRODUCT",
    "productId": "uuid",
    "reason": "COUNTERFEIT",
    "description": "This product appears to be fake"
  }
  ```
- **Report Types:** `PRODUCT`, `SELLER`
- **Reasons:** `INAPPROPRIATE_CONTENT`, `COUNTERFEIT`, `FRAUD`, `SPAM`, `MISLEADING`, `OTHER`

### Get All Reports (Admin)
- **GET** `/reports?page=1&pageSize=20&type=PRODUCT&status=PENDING`
- **Access:** Private (Admin only)

### Get My Reports
- **GET** `/reports/my/reports?page=1&pageSize=20`
- **Access:** Private (All authenticated users)

### Get Report by ID
- **GET** `/reports/:id`
- **Access:** Private (Reporter or Admin)

### Update Report Status (Admin)
- **PUT** `/reports/:id/status`
- **Access:** Private (Admin only)
- **Body:**
  ```json
  {
    "status": "RESOLVED",
    "adminNotes": "Issue has been addressed"
  }
  ```
- **Valid Statuses:** `PENDING`, `UNDER_REVIEW`, `RESOLVED`, `DISMISSED`

---

## 9. Notifications

### Get My Notifications
- **GET** `/notifications?page=1&pageSize=20&isRead=false`
- **Access:** Private (All authenticated users)
- **Response includes:**
  - Notifications array
  - Unread count

### Get Unread Count
- **GET** `/notifications/unread/count`
- **Access:** Private (All authenticated users)

### Get Notification by ID
- **GET** `/notifications/:id`
- **Access:** Private (Notification owner)

### Mark Notification as Read
- **PUT** `/notifications/:id/read`
- **Access:** Private (Notification owner)

### Mark All as Read
- **PUT** `/notifications/read-all`
- **Access:** Private (All authenticated users)

### Delete Notification
- **DELETE** `/notifications/:id`
- **Access:** Private (Notification owner)

### Delete All Notifications
- **DELETE** `/notifications`
- **Access:** Private (All authenticated users)

---

## User Roles & Permissions

### BUYER
- Create orders
- Review purchased products
- Report products/sellers
- Receive notifications

### SELLER
- All BUYER permissions
- Create and manage store
- Create and manage products
- Manage store orders
- Update order status

### MUNICIPAL_ADMIN
- View all data in assigned municipality
- Approve/suspend products
- Suspend/unsuspend stores
- Manage reports

### SUPER_ADMIN
- All permissions across all municipalities
- Manage users (create admins, suspend users)
- Manage municipalities
- Manage categories

---

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Paginated Response
```json
{
  "success": true,
  "message": "Data retrieved successfully",
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message",
  "errors": [ ... ]
}
```

---

## Product Status Workflow

1. **PENDING** - Newly created, awaiting admin approval
2. **APPROVED** - Approved by admin, visible to buyers
3. **SUSPENDED** - Suspended by admin due to violations
4. **ARCHIVED** - Archived by admin

---

## Order Status Workflow

1. **PENDING** - Order created, awaiting seller confirmation
2. **CONFIRMED** - Seller confirmed the order
3. **PREPARING** - Seller is preparing the order
4. **READY** - Order is ready for pickup/delivery
5. **COMPLETED** - Order has been completed
6. **CANCELLED** - Order was cancelled (by buyer or seller)

---

## Municipality Codes

Oriental Mindoro municipalities (15 total):
- CALAPAN - Calapan City
- BACO - Baco
- NAUJAN - Naujan
- VICTORIA - Victoria
- SOCORRO - Socorro
- PINAMALAYAN - Pinamalayan
- BANSUD - Bansud
- GLORIA - Gloria
- BONGABONG - Bongabong
- ROXAS - Roxas
- MANSALAY - Mansalay
- BULALACAO - Bulalacao
- SAN_TEODORO - San Teodoro
- POLA - Pola
- PUERTO_GALERA - Puerto Galera

---

## Testing Notes

- Database connection pool timeout issue exists (will be resolved later)
- All modules are complete and ready for integration testing
- Seed data: 15 municipalities and 10 categories are in the database
- JWT tokens required for authenticated endpoints

---

**Total Endpoints:** 80+

**Architecture:** Clean Architecture (Repository → Service → Controller → Routes)

**Database:** MySQL with Prisma ORM 5.22.0
