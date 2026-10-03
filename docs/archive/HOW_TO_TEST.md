# How to Test E-MOORM System

## Quick Start Guide

### ✅ Both Servers Are Already Running!

Your system is currently operational:
- **Backend API**: http://localhost:3000/api
- **Frontend App**: http://localhost:5173

---

## 1. View the Frontend App

### Open in Browser
Simply open your web browser and navigate to:

```
http://localhost:5173
```

**What You Should See:**
- ✅ E-MOORM logo and header with search bar
- ✅ Green hero banner with "Shop with Mindoro's Originals"
- ✅ Category cards (Vegetables, Fruits, Seafood, etc.)
- ✅ Featured products section
- ✅ Stores near you
- ✅ Footer with all links

### Test the Frontend
1. **Scroll through the homepage** - see all sections
2. **Check responsive design** - resize your browser window
3. **Click on category cards** - they should be hoverable
4. **Try the search bar** - type something (won't search yet, but UI works)
5. **Click the cart icon** - shows badge count
6. **Open mobile view** - click the hamburger menu (☰)

---

## 2. Test the Backend API

### Using Browser
Open these URLs directly in your browser:

```
http://localhost:3000/api/municipalities
http://localhost:3000/api/categories
http://localhost:3000/api/stores
http://localhost:3000/api/products
```

**Expected Result**: JSON data displayed in browser

### Using PowerShell
Run these commands in PowerShell:

```powershell
# Test Municipalities (Should return 15)
Invoke-RestMethod -Uri "http://localhost:3000/api/municipalities"

# Test Categories (Should return 10)
Invoke-RestMethod -Uri "http://localhost:3000/api/categories"

# Test a specific municipality
Invoke-RestMethod -Uri "http://localhost:3000/api/municipalities/7a5b0fdb-8f12-11f1-9867-0a002700000e"
```

### Using Postman or Thunder Client

1. **Create a new request**
2. **Set method to GET**
3. **Enter URL**: `http://localhost:3000/api/municipalities`
4. **Click Send**
5. **Expected**: JSON response with 15 municipalities

---

## 3. Test Authentication Flow

### Register a New User

**Using PowerShell:**
```powershell
$municId = "7a5b0fdb-8f12-11f1-9867-0a002700000e"  # Baco municipality

$body = @{
    email = "testuser@example.com"
    password = "TestUser123!@#"
    confirmPassword = "TestUser123!@#"
    fullName = "Test User"
    contactNumber = "09171234567"
    municipalityId = $municId
    address = "123 Test St, Calapan City"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/auth/register" -Method Post -Body $body -ContentType "application/json"
```

### Login

**Using PowerShell:**
```powershell
$loginBody = @{
    email = "testuser@example.com"
    password = "TestUser123!@#"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"

# Save the token
$token = $response.data.accessToken
Write-Host "Token: $token"
```

### Use the Token

```powershell
$headers = @{
    Authorization = "Bearer $token"
}

# Get your profile
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/profile" -Headers $headers
```

---

## 4. Test Complete Workflow

### Scenario: Browse Products as Guest

1. Open http://localhost:5173
2. Scroll through home page
3. Click on a category (UI only, no data yet)
4. View featured products
5. Click on a product card (will navigate when route exists)

### Scenario: View Backend Data

1. Open http://localhost:3000/api/municipalities
2. Note the municipality IDs
3. Open http://localhost:3000/api/categories
4. Note the category IDs
5. Use these IDs to test other endpoints

---

## 5. Check Server Status

### View Backend Logs
The backend terminal shows all API requests:
```
2026-08-03T12:29:12.861Z - GET /api/municipalities
2026-08-03T12:29:13.179Z - GET /api/categories
```

### View Frontend Build
The frontend terminal shows:
```
VITE v8.2.0 ready in 555 ms
➜ Local:   http://localhost:5173/
```

---

## 6. Verify Database

### Using Prisma Studio
```bash
cd backend
npx prisma studio
```

This opens a visual database browser at http://localhost:5555

**What to check:**
- ✅ 15 municipalities in Municipality table
- ✅ 10 categories in Category table
- ✅ Any users you created
- ✅ Any stores or products

---

## 7. Test Different Roles

### Create a Buyer (Default)
Already done when you register normally.

### Apply to be a Seller
```powershell
$headers = @{
    Authorization = "Bearer $token"
}

$sellerBody = @{
    businessName = "Test Shop"
    businessDescription = "A test shop"
    businessAddress = "456 Shop St"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/auth/apply-seller" -Method Post -Body $sellerBody -Headers $headers -ContentType "application/json"
```

---

## 8. Common Issues & Solutions

### Issue: Port 3000 already in use
**Solution**: Stop other Node.js processes or change the port in backend/.env

### Issue: Port 5173 already in use
**Solution**: Vite will automatically use another port (5174, 5175, etc.)

### Issue: Frontend shows blank page
**Solution**: 
1. Check browser console for errors (F12)
2. Verify both servers are running
3. Clear browser cache

### Issue: API returns 404
**Solution**: 
1. Check the backend terminal for errors
2. Verify database is running (Laragon)
3. Check .env file configuration

### Issue: Database connection error
**Solution**:
1. Start Laragon MySQL
2. Restart backend server
3. Run: `npx prisma generate`

---

## 9. Browser Testing Checklist

### Desktop View (1920x1080)
- [ ] Header with logo and search bar visible
- [ ] Hero banner displays correctly
- [ ] Categories grid shows 9 cards in rows
- [ ] Products grid shows 6 cards
- [ ] Footer displays all sections
- [ ] Hover effects work on cards and buttons

### Tablet View (768x1024)
- [ ] Header adjusts properly
- [ ] Hero banner stacks vertically
- [ ] Categories show 3 columns
- [ ] Products show 2-3 columns
- [ ] Footer sections stack

### Mobile View (375x667)
- [ ] Mobile menu (hamburger) appears
- [ ] Search bar moves to mobile menu
- [ ] All content is readable
- [ ] Categories show 2 columns
- [ ] Products show 1 column
- [ ] Footer is readable

---

## 10. What to Test Next

Once you confirm everything above works:

### Phase 1: Authentication Pages
- [ ] Create Login page
- [ ] Create Register page
- [ ] Test login flow
- [ ] Test registration flow
- [ ] Test token storage

### Phase 2: Product Pages
- [ ] Product listing with real data
- [ ] Product details page
- [ ] Search functionality
- [ ] Filter by category
- [ ] Filter by municipality

### Phase 3: E-commerce Flow
- [ ] Add to cart functionality
- [ ] Cart page with items
- [ ] Checkout flow
- [ ] Order confirmation
- [ ] Order history

---

## Need Help?

### Server Not Starting?
```bash
# Backend
cd backend
npm install
npm start

# Frontend
cd web
npm install
npm run dev
```

### Want to Stop Servers?
Press `Ctrl + C` in the terminal or close the terminal windows.

### Want to Restart?
Close the terminals and run the start commands again.

---

## Success Indicators

✅ **Backend is working if:**
- You can access http://localhost:3000/api/municipalities
- JSON data is returned
- No error messages in terminal

✅ **Frontend is working if:**
- You can access http://localhost:5173
- Home page loads with design
- No console errors in browser (F12)

✅ **System is ready if:**
- Both backend and frontend are accessible
- Database has seeded data
- No errors in any terminal

---

**Current Status: ✅ ALL SYSTEMS OPERATIONAL**

Happy Testing! 🎉
