# APP_CONTEXT.md

# E-MOORM

**E-Commerce Platform for Local Entrepreneurs and Agricultural Producers in Oriental Mindoro**

Version: 1.0

---

# Project Overview

E-MOORM is a full-stack, multi-platform e-commerce system developed to support local entrepreneurs, farmers, cooperatives, MSMEs, and consumers within the Province of Oriental Mindoro, Philippines.

The platform allows local businesses to sell products online while giving buyers an easy, secure, and modern shopping experience.

The project consists of three applications sharing one backend:

- Web Application (React + Vite)
- Mobile Application (React Native + Expo)
- REST API Backend (Express.js)

The system follows a modular architecture so that future features and additional provinces can be added without major rewrites.

---

# Primary Objectives

The system aims to:

- Promote local businesses in Oriental Mindoro.
- Digitalize agricultural and local product selling.
- Connect buyers and sellers in one platform.
- Provide municipality-based administration.
- Maintain a secure, scalable, and maintainable codebase.

---

# Technology Stack

## Web

- React.js
- Vite
- TypeScript
- React Router
- Tailwind CSS
- Axios

## Mobile

- React Native
- Expo SDK 57
- TypeScript
- React Navigation
- Axios

## Backend

- Express.js
- TypeScript
- REST API
- Prisma ORM
- JWT Authentication
- bcrypt

## Database

- MySQL
- Laragon
- phpMyAdmin

## Development Tools

- Git
- GitHub
- ESLint
- Prettier

---

# System Architecture

```
                 React Web (Vite)
                        │
                        │
                  REST API (HTTPS)
                        │
                        ▼
                 Express.js Backend
                        │
        ┌───────────────┴────────────────┐
        │                                │
 Authentication                  Business Logic
        │                                │
        └───────────────┬────────────────┘
                        │
                    Prisma ORM
                        │
                        ▼
                     MySQL
                        ▲
                        │
             React Native (Expo)
```

Both frontend applications must consume the same REST API.

Neither frontend is allowed to communicate directly with the database.

---

# User Roles

The system contains five user roles.

## Guest

Can:

- Browse products
- Search products
- View stores
- Register
- Login

Cannot:

- Purchase
- Chat
- Review
- Sell

---

## Buyer

Every registered user starts as a Buyer.

Buyer capabilities:

- Manage profile
- Browse products
- Search
- Wishlist
- Shopping cart
- Checkout
- Track orders
- Review purchased products
- Report products
- Report sellers
- Apply to become a seller

---

## Seller

A seller is simply a buyer with additional permissions.

Seller capabilities:

- Own one store
- Manage products
- Manage inventory
- Accept or reject orders
- View sales
- Manage store profile
- Respond to buyers

Each seller belongs to one municipality.

---

## Municipal Junior Admin

Each Junior Admin manages exactly one municipality.

Examples:

- Bongabong
- Roxas
- Pinamalayan
- Gloria
- Bansud
- Naujan
- Calapan City

Responsibilities:

- Review seller applications
- Approve or reject products
- Moderate reports
- Suspend sellers
- Suspend products
- View municipal analytics
- Publish municipal announcements

Restrictions:

Cannot:

- Access another municipality
- Create administrators
- Change global settings
- Delete transactional data
- Manage categories
- View province-wide analytics

---

## Super Admin

Highest authority.

Can manage:

- Entire platform
- Municipalities
- Users
- Sellers
- Junior Admins
- Categories
- Reports
- System settings
- Audit logs
- Platform analytics

---

# Municipality-Based Administration

Every:

- Buyer
- Seller
- Product
- Report
- Store

belongs to exactly one municipality.

Municipal Junior Admin only manages records within their assigned municipality.

This permission must always be enforced by backend authorization.

---

# Authentication

Authentication uses JWT.

Flow:

Register

↓

Hash Password (bcrypt)

↓

Store User

↓

Login

↓

Generate JWT

↓

Return Access Token

↓

Authenticated API Requests

Passwords must never be stored in plain text.

---

# Authorization

Authorization is enforced by Express middleware.

Every protected endpoint must:

- Verify JWT
- Verify authenticated user
- Verify role
- Verify municipality ownership if required

Never rely on frontend role validation.

---

# Core Modules

## Authentication

- Register
- Login
- Logout
- Forgot Password
- Reset Password

---

## User Profile

Contains:

- Full Name
- Email
- Contact Number
- Municipality
- Barangay
- Address
- Profile Photo

---

## Store

Seller only.

Contains:

- Store Name
- Logo
- Cover Image
- Description
- Business Hours
- Municipality

One seller owns one store.

---

## Products

Fields include:

- Product Name
- Description
- Price
- Category
- Stock
- Images
- Municipality
- Seller
- Status

Product Status:

- Pending
- Approved
- Hidden
- Suspended
- Archived

New products require approval from the assigned Municipal Junior Admin before they become visible.

---

## Categories

Managed only by Super Admin.

Examples:

- Fruits
- Vegetables
- Rice
- Livestock
- Seafood
- Processed Foods
- Handicrafts
- Local Delicacies

---

## Shopping Cart

Each buyer owns one active cart.

Stores:

- Product
- Quantity
- Price Snapshot

---

## Orders

Order lifecycle:

Pending

↓

Confirmed

↓

Preparing

↓

Ready for Pickup / Delivery

↓

Completed

Alternative status:

Cancelled

---

## Wishlist

Allows buyers to save products.

---

## Reviews

Only buyers with completed orders may submit reviews.

---

## Reports

Users can report:

- Sellers
- Products

Reports are automatically routed to the assigned Municipal Junior Admin.

---

## Notifications

Examples:

- Order Received
- Order Confirmed
- Product Approved
- Seller Approved
- Product Suspended
- Report Submitted

Design notifications so they can later support push notifications.

---

# Business Rules

- One account per user.
- A Buyer may become a Seller.
- One Seller owns one Store.
- Products belong to one Seller.
- Products belong to one Municipality.
- Orders belong to one Buyer.
- Buyers cannot purchase suspended products.
- Suspended sellers cannot publish products.
- Historical order prices must never change.
- Use soft deletes whenever possible.

---

# REST API Standards

Example routes:

GET /api/products

GET /api/products/:id

POST /api/products

PUT /api/products/:id

DELETE /api/products/:id

Responses should follow this format.

Success:

```json
{
    "success": true,
    "message": "Operation successful",
    "data": {}
}
```

Error:

```json
{
    "success": false,
    "message": "Validation failed",
    "errors": []
}
```

---

# Database Principles

Use MySQL.

Every table should include:

- id
- created_at
- updated_at

Optional:

- deleted_at

Use UUIDs whenever practical.

Transactional records should never be permanently deleted.

---

# File Uploads

Development:

Store files locally.

Production:

Use Cloudinary or another cloud storage service.

Store only file URLs inside MySQL.

Never store binary files in the database.

---

# Backend Architecture

Controllers

- Receive request
- Validate request
- Call service
- Return response

Services

- Business logic

Repositories

- Database queries

Middleware

- Authentication
- Authorization
- Validation

Utilities

- Shared helper functions

---

# Recommended Folder Structure

```
emoorm/

web/
    src/
        assets/
        components/
        contexts/
        hooks/
        layouts/
        pages/
        routes/
        services/
        types/
        utils/

backend/
    src/
        config/
        controllers/
        middleware/
        repositories/
        routes/
        services/
        validators/
        utils/
        prisma/
        uploads/

mobile/
    src/
        components/
        navigation/
        screens/
        services/
        hooks/

database/
    schema/
    migrations/
    seeds/
    backups/

shared/
docs/

README.md
APP_CONTEXT.md
DATABASE_RULES.md
API_CONTRACT.md
UI_GUIDELINES.md
CODING_STANDARDS.md
FEATURES.md
```

---

# Coding Standards

Always use:

- TypeScript
- Functional Components
- Async/Await
- Clean Architecture
- ESLint
- Prettier

Avoid:

- `any`
- Duplicate logic
- Hardcoded values
- Business logic inside controllers
- Direct database queries inside routes

---

# Security Guidelines

Always:

- Hash passwords using bcrypt.
- Validate every request.
- Sanitize user input.
- Verify JWT on protected endpoints.
- Enforce role-based permissions.
- Enforce municipality-based permissions.
- Use parameterized queries through Prisma.

Never:

- Store passwords in plain text.
- Expose secrets.
- Trust frontend permissions.
- Return sensitive information.

---

# Future Roadmap

Potential future modules:

- GCash Payment Integration
- QR Code Payments
- Delivery Rider Module
- Real-time Chat
- Push Notifications
- AI Product Recommendations
- Sales Forecasting
- Inventory Forecasting
- Farmer Cooperative Accounts
- Multi-Province Expansion

The architecture should remain modular to support these future features.

---

# AI Development Instructions

This document is the primary source of truth for AI coding assistants.

When generating code:

1. Follow this document before making implementation decisions.
2. Generate production-ready, maintainable code.
3. Follow React, Express, and TypeScript best practices.
4. Keep controllers thin and place business logic inside services.
5. Reuse components and utilities whenever possible.
6. Enforce authentication and authorization on the backend.
7. Respect municipality-based access restrictions.
8. Keep code modular and scalable.
9. Write readable and well-typed code.
10. Prefer long-term maintainability over short-term shortcuts.
