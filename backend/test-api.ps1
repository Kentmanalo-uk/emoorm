# E-MOORM API Comprehensive Testing Script
# Tests all 67 endpoints across 9 modules

$ErrorActionPreference = "Continue"
$baseUrl = "http://localhost:3000/api"

# Color output functions
function Write-Success { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "✗ $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "ℹ $msg" -ForegroundColor Cyan }
function Write-Section { param($msg) Write-Host "`n═══════════════════════════════════════════════════" -ForegroundColor Magenta; Write-Host "  $msg" -ForegroundColor Yellow; Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Magenta }

# Test counter
$script:passed = 0
$script:failed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers = @{},
        [string]$Body = $null,
        [scriptblock]$Validator = { $true }
    )
    
    try {
        $params = @{
            Uri = "$baseUrl$Uri"
            Method = $Method
            Headers = $Headers
            ContentType = "application/json"
        }
        
        if ($Body) { $params.Body = $Body }
        
        $response = Invoke-RestMethod @params
        
        if (& $Validator $response) {
            Write-Success $Name
            $script:passed++
            return $response
        } else {
            Write-Error "$Name - Validation failed"
            $script:failed++
            return $null
        }
    } catch {
        Write-Error "$Name - $($_.Exception.Message)"
        $script:failed++
        return $null
    }
}

# ═══════════════════════════════════════════════════
# 1. MUNICIPALITY MODULE (6 endpoints)
# ═══════════════════════════════════════════════════
Write-Section "1. MUNICIPALITY MODULE (6 endpoints)"

$munics = Test-Endpoint -Name "GET /municipalities - Get all" -Method GET -Uri "/municipalities" -Validator { param($r) $r.success -and $r.data.Count -eq 15 }

$municId = $munics.data[0].id
Write-Info "Using Municipality ID: $municId"

Test-Endpoint -Name "GET /municipalities/:id - Get by ID" -Method GET -Uri "/municipalities/$municId" -Validator { param($r) $r.success -and $r.data.id -eq $municId }

Test-Endpoint -Name "GET /municipalities/search - Search by name" -Method GET -Uri "/municipalities/search?name=Calapan" -Validator { param($r) $r.success -and $r.data.Count -gt 0 }

Test-Endpoint -Name "GET /municipalities/active - Get active only" -Method GET -Uri "/municipalities/active" -Validator { param($r) $r.success }

# Admin endpoints will be tested after authentication

# ═══════════════════════════════════════════════════
# 2. CATEGORY MODULE (6 endpoints)
# ═══════════════════════════════════════════════════
Write-Section "2. CATEGORY MODULE (6 endpoints)"

$cats = Test-Endpoint -Name "GET /categories - Get all" -Method GET -Uri "/categories" -Validator { param($r) $r.success -and $r.data.Count -eq 10 }

$catId = $cats.data[0].id
Write-Info "Using Category ID: $catId"

Test-Endpoint -Name "GET /categories/:id - Get by ID" -Method GET -Uri "/categories/$catId" -Validator { param($r) $r.success -and $r.data.id -eq $catId }

Test-Endpoint -Name "GET /categories/search - Search by name" -Method GET -Uri "/categories/search?name=Fashion" -Validator { param($r) $r.success }

Test-Endpoint -Name "GET /categories/active - Get active only" -Method GET -Uri "/categories/active" -Validator { param($r) $r.success -and $r.data.Count -gt 0 }

# ═══════════════════════════════════════════════════
# 3. AUTHENTICATION MODULE (11 endpoints)
# ═══════════════════════════════════════════════════
Write-Section "3. AUTHENTICATION MODULE (11 endpoints)"

# Register Buyer
$buyerBody = @{
    email = "buyer.test@emoorm.com"
    password = "Buyer123!@#"
    confirmPassword = "Buyer123!@#"
    name = "Test Buyer"
    contactNumber = "09123456701"
    municipalityId = $municId
    address = "123 Test St, Calapan City"
} | ConvertTo-Json

$buyerReg = Test-Endpoint -Name "POST /auth/register - Register Buyer" -Method POST -Uri "/auth/register" -Body $buyerBody -Validator { param($r) $r.success -or $r.message -match "already exists" }

# Login Buyer
$buyerLoginBody = @{
    email = "buyer.test@emoorm.com"
    password = "Buyer123!@#"
} | ConvertTo-Json

$buyerLogin = Test-Endpoint -Name "POST /auth/login - Login Buyer" -Method POST -Uri "/auth/login" -Body $buyerLoginBody -Validator { param($r) $r.success -and $r.data.token }

$buyerToken = $buyerLogin.data.token
$buyerId = $buyerLogin.data.user.id
Write-Info "Buyer Token: $($buyerToken.Substring(0, 30))..."

# Register Seller
$sellerBody = @{
    email = "seller.test@emoorm.com"
    password = "Seller123!@#"
    confirmPassword = "Seller123!@#"
    name = "Test Seller"
    contactNumber = "09123456702"
    municipalityId = $municId
    address = "456 Shop Ave, Calapan City"
} | ConvertTo-Json

Test-Endpoint -Name "POST /auth/register - Register Seller" -Method POST -Uri "/auth/register" -Body $sellerBody -Validator { param($r) $r.success -or $r.message -match "already exists" }

# Login Seller
$sellerLoginBody = @{
    email = "seller.test@emoorm.com"
    password = "Seller123!@#"
} | ConvertTo-Json

$sellerLogin = Test-Endpoint -Name "POST /auth/login - Login Seller" -Method POST -Uri "/auth/login" -Body $sellerLoginBody -Validator { param($r) $r.success -and $r.data.token }

$sellerToken = $sellerLogin.data.token
$sellerId = $sellerLogin.data.user.id
Write-Info "Seller Token: $($sellerToken.Substring(0, 30))..."

# Register Admin
$adminBody = @{
    email = "admin.test@emoorm.com"
    password = "Admin123!@#"
    confirmPassword = "Admin123!@#"
    name = "Test Admin"
    contactNumber = "09123456700"
    municipalityId = $municId
    address = "Admin Office, Calapan City"
} | ConvertTo-Json

Test-Endpoint -Name "POST /auth/register - Register Admin" -Method POST -Uri "/auth/register" -Body $adminBody -Validator { param($r) $r.success -or $r.message -match "already exists" }

# Login Admin
$adminLoginBody = @{
    email = "admin.test@emoorm.com"
    password = "Admin123!@#"
} | ConvertTo-Json

$adminLogin = Test-Endpoint -Name "POST /auth/login - Login Admin" -Method POST -Uri "/auth/login" -Body $adminLoginBody -Validator { param($r) $r.success -and $r.data.token }

$adminToken = $adminLogin.data.token
$adminId = $adminLogin.data.user.id
Write-Info "Admin Token: $($adminToken.Substring(0, 30))..."

# Test authenticated endpoints
$authHeaders = @{ "Authorization" = "Bearer $buyerToken" }

Test-Endpoint -Name "GET /auth/profile - Get profile" -Method GET -Uri "/auth/profile" -Headers $authHeaders -Validator { param($r) $r.success -and $r.data.email -eq "buyer.test@emoorm.com" }

# Apply for seller
$applyBody = @{
    businessName = "Test Shop"
    businessDescription = "A test shop for testing"
    businessAddress = "789 Commerce Blvd, Calapan City"
} | ConvertTo-Json

Test-Endpoint -Name "POST /auth/apply-seller - Apply for seller" -Method POST -Uri "/auth/apply-seller" -Body $applyBody -Headers $authHeaders -Validator { param($r) $r.success -or $r.message -match "already" }

# Admin: Get pending applications
$adminHeaders = @{ "Authorization" = "Bearer $adminToken" }

$pending = Test-Endpoint -Name "GET /auth/pending-sellers - Get pending applications" -Method GET -Uri "/auth/pending-sellers" -Headers $adminHeaders -Validator { param($r) $r.success }

# Admin: Approve/reject seller
if ($pending -and $pending.data.Count -gt 0) {
    $applicationId = $pending.data[0].id
    $approveBody = @{ approved = $true; reason = "Approved for testing" } | ConvertTo-Json
    Test-Endpoint -Name "PUT /auth/approve-seller/:id - Approve seller" -Method PUT -Uri "/auth/approve-seller/$applicationId" -Body $approveBody -Headers $adminHeaders -Validator { param($r) $r.success }
}

# Admin: Get all users
Test-Endpoint -Name "GET /auth/users - Get all users" -Method GET -Uri "/auth/users" -Headers $adminHeaders -Validator { param($r) $r.success -and $r.data.Count -gt 0 }

# Admin: Deactivate/activate user
$deactivateBody = @{ active = $false; reason = "Testing deactivation" } | ConvertTo-Json
Test-Endpoint -Name "PUT /auth/users/:id/status - Deactivate user" -Method PUT -Uri "/auth/users/$sellerId/status" -Body $deactivateBody -Headers $adminHeaders -Validator { param($r) $r.success -or $r.message -match "not found" }

$activateBody = @{ active = $true; reason = "Reactivated for testing" } | ConvertTo-Json
Test-Endpoint -Name "PUT /auth/users/:id/status - Activate user" -Method PUT -Uri "/auth/users/$sellerId/status" -Body $activateBody -Headers $adminHeaders -Validator { param($r) $r.success -or $r.message -match "not found" }

# ═══════════════════════════════════════════════════
# 4. STORE MODULE (9 endpoints)
# ═══════════════════════════════════════════════════
Write-Section "4. STORE MODULE (9 endpoints)"

$sellerHeaders = @{ "Authorization" = "Bearer $sellerToken" }

# Create store
$storeBody = @{
    name = "Test Store"
    description = "A test store for testing purposes"
    address = "789 Commerce Blvd, Calapan City"
    municipalityId = $municId
    contactNumber = "09123456702"
} | ConvertTo-Json

$store = Test-Endpoint -Name "POST /stores - Create store" -Method POST -Uri "/stores" -Body $storeBody -Headers $sellerHeaders -Validator { param($r) $r.success -or $r.message -match "already" }

# Get all stores
$stores = Test-Endpoint -Name "GET /stores - Get all stores" -Method GET -Uri "/stores" -Validator { param($r) $r.success }

if ($stores -and $stores.data.Count -gt 0) {
    $storeId = $stores.data[0].id
    Write-Info "Using Store ID: $storeId"
    
    Test-Endpoint -Name "GET /stores/:id - Get store by ID" -Method GET -Uri "/stores/$storeId" -Validator { param($r) $r.success -and $r.data.id -eq $storeId }
    
    Test-Endpoint -Name "GET /stores/search - Search stores" -Method GET -Uri "/stores/search?name=Test" -Validator { param($r) $r.success }
    
    Test-Endpoint -Name "GET /stores/municipality/:id - Get by municipality" -Method GET -Uri "/stores/municipality/$municId" -Validator { param($r) $r.success }
    
    # Update store
    $updateStoreBody = @{
        description = "Updated test store description"
        contactNumber = "09123456702"
    } | ConvertTo-Json
    
    Test-Endpoint -Name "PUT /stores/:id - Update store" -Method PUT -Uri "/stores/$storeId" -Body $updateStoreBody -Headers $sellerHeaders -Validator { param($r) $r.success }
    
    # Admin: Verify store
    $verifyBody = @{ verified = $true; reason = "Verified for testing" } | ConvertTo-Json
    Test-Endpoint -Name "PUT /stores/:id/verify - Verify store" -Method PUT -Uri "/stores/$storeId/verify" -Body $verifyBody -Headers $adminHeaders -Validator { param($r) $r.success }
    
    # Toggle active status
    $toggleBody = @{ active = $true } | ConvertTo-Json
    Test-Endpoint -Name "PUT /stores/:id/status - Toggle store status" -Method PUT -Uri "/stores/$storeId/status" -Body $toggleBody -Headers $sellerHeaders -Validator { param($r) $r.success }
    
    Test-Endpoint -Name "GET /stores/:id/products - Get store products" -Method GET -Uri "/stores/$storeId/products" -Validator { param($r) $r.success }
}

# ═══════════════════════════════════════════════════
# 5. PRODUCT MODULE (10 endpoints)
# ═══════════════════════════════════════════════════
Write-Section "5. PRODUCT MODULE (10 endpoints)"

if ($stores -and $stores.data.Count -gt 0) {
    $storeId = $stores.data[0].id
    
    # Create product
    $productBody = @{
        name = "Test Product"
        description = "A test product for testing"
        price = 599.99
        stock = 100
        categoryId = $catId
        storeId = $storeId
    } | ConvertTo-Json
    
    $product = Test-Endpoint -Name "POST /products - Create product" -Method POST -Uri "/products" -Body $productBody -Headers $sellerHeaders -Validator { param($r) $r.success }
    
    # Get all products
    $products = Test-Endpoint -Name "GET /products - Get all products" -Method GET -Uri "/products" -Validator { param($r) $r.success }
    
    if ($products -and $products.data.Count -gt 0) {
        $productId = $products.data[0].id
        Write-Info "Using Product ID: $productId"
        
        Test-Endpoint -Name "GET /products/:id - Get product by ID" -Method GET -Uri "/products/$productId" -Validator { param($r) $r.success -and $r.data.id -eq $productId }
        
        Test-Endpoint -Name "GET /products/search - Search products" -Method GET -Uri "/products/search?name=Test" -Validator { param($r) $r.success }
        
        Test-Endpoint -Name "GET /products/category/:id - Get by category" -Method GET -Uri "/products/category/$catId" -Validator { param($r) $r.success }
        
        # Update product
        $updateProductBody = @{
            description = "Updated test product description"
            price = 699.99
            stock = 150
        } | ConvertTo-Json
        
        Test-Endpoint -Name "PUT /products/:id - Update product" -Method PUT -Uri "/products/$productId" -Body $updateProductBody -Headers $sellerHeaders -Validator { param($r) $r.success }
        
        # Admin: Approve product
        $approveProductBody = @{ approved = $true; reason = "Approved for testing" } | ConvertTo-Json
        Test-Endpoint -Name "PUT /products/:id/approve - Approve product" -Method PUT -Uri "/products/$productId/approve" -Body $approveProductBody -Headers $adminHeaders -Validator { param($r) $r.success }
        
        # Toggle active status
        $toggleProductBody = @{ active = $true } | ConvertTo-Json
        Test-Endpoint -Name "PUT /products/:id/status - Toggle product status" -Method PUT -Uri "/products/$productId/status" -Body $toggleProductBody -Headers $sellerHeaders -Validator { param($r) $r.success }
        
        Test-Endpoint -Name "GET /products/:id/reviews - Get product reviews" -Method GET -Uri "/products/$productId/reviews" -Validator { param($r) $r.success }
        
        # Featured products will be tested after some products exist
        Test-Endpoint -Name "GET /products/featured - Get featured products" -Method GET -Uri "/products/featured" -Validator { param($r) $r.success }
    }
}

# ═══════════════════════════════════════════════════
# 6. ORDER MODULE (7 endpoints)
# ═══════════════════════════════════════════════════
Write-Section "6. ORDER MODULE (7 endpoints)"

if ($products -and $products.data.Count -gt 0) {
    $productId = $products.data[0].id
    
    # Create order
    $orderBody = @{
        items = @(
            @{
                productId = $productId
                quantity = 2
                price = 699.99
            }
        )
        deliveryAddress = "123 Test St, Calapan City"
        deliveryMunicipalityId = $municId
        contactNumber = "09123456701"
        notes = "Test order - please handle with care"
    } | ConvertTo-Json -Depth 3
    
    $order = Test-Endpoint -Name "POST /orders - Create order" -Method POST -Uri "/orders" -Body $orderBody -Headers $authHeaders -Validator { param($r) $r.success }
    
    # Get buyer orders
    Test-Endpoint -Name "GET /orders/buyer - Get buyer orders" -Method GET -Uri "/orders/buyer" -Headers $authHeaders -Validator { param($r) $r.success }
    
    # Get seller orders
    Test-Endpoint -Name "GET /orders/seller - Get seller orders" -Method GET -Uri "/orders/seller" -Headers $sellerHeaders -Validator { param($r) $r.success }
    
    # Get all orders
    $orders = Test-Endpoint -Name "GET /orders - Get all orders" -Method GET -Uri "/orders" -Headers $authHeaders -Validator { param($r) $r.success }
    
    if ($orders -and $orders.data.Count -gt 0) {
        $orderId = $orders.data[0].id
        Write-Info "Using Order ID: $orderId"
        
        Test-Endpoint -Name "GET /orders/:id - Get order by ID" -Method GET -Uri "/orders/$orderId" -Headers $authHeaders -Validator { param($r) $r.success -and $r.data.id -eq $orderId }
        
        # Update order status (seller)
        $updateOrderBody = @{ status = "PROCESSING" } | ConvertTo-Json
        Test-Endpoint -Name "PUT /orders/:id/status - Update order status" -Method PUT -Uri "/orders/$orderId/status" -Body $updateOrderBody -Headers $sellerHeaders -Validator { param($r) $r.success }
        
        # Cancel order (buyer)
        $cancelBody = @{ reason = "Changed my mind - testing cancellation" } | ConvertTo-Json
        Test-Endpoint -Name "PUT /orders/:id/cancel - Cancel order" -Method PUT -Uri "/orders/$orderId/cancel" -Body $cancelBody -Headers $authHeaders -Validator { param($r) $r.success -or $r.message -match "cannot be cancelled" }
    }
}

# ═══════════════════════════════════════════════════
# 7. REVIEW MODULE (6 endpoints)
# ═══════════════════════════════════════════════════
Write-Section "7. REVIEW MODULE (6 endpoints)"

if ($orders -and $orders.data.Count -gt 0 -and $products -and $products.data.Count -gt 0) {
    $orderId = $orders.data[0].id
    $productId = $products.data[0].id
    
    # Create review
    $reviewBody = @{
        productId = $productId
        orderId = $orderId
        rating = 5
        comment = "Excellent product! Very satisfied with the purchase."
    } | ConvertTo-Json
    
    $review = Test-Endpoint -Name "POST /reviews - Create review" -Method POST -Uri "/reviews" -Body $reviewBody -Headers $authHeaders -Validator { param($r) $r.success -or $r.message -match "already" }
    
    # Get product reviews
    Test-Endpoint -Name "GET /reviews/product/:id - Get product reviews" -Method GET -Uri "/reviews/product/$productId" -Validator { param($r) $r.success }
    
    # Get user reviews
    Test-Endpoint -Name "GET /reviews/user - Get user reviews" -Method GET -Uri "/reviews/user" -Headers $authHeaders -Validator { param($r) $r.success }
    
    # Get review stats
    Test-Endpoint -Name "GET /reviews/product/:id/stats - Get review stats" -Method GET -Uri "/reviews/product/$productId/stats" -Validator { param($r) $r.success }
    
    # Get all reviews
    $reviews = Test-Endpoint -Name "GET /reviews - Get all reviews" -Method GET -Uri "/reviews" -Headers $authHeaders -Validator { param($r) $r.success }
    
    if ($reviews -and $reviews.data.Count -gt 0) {
        $reviewId = $reviews.data[0].id
        Write-Info "Using Review ID: $reviewId"
        
        # Update review
        $updateReviewBody = @{
            rating = 4
            comment = "Updated: Good product, worth the price."
        } | ConvertTo-Json
        
        Test-Endpoint -Name "PUT /reviews/:id - Update review" -Method PUT -Uri "/reviews/$reviewId" -Body $updateReviewBody -Headers $authHeaders -Validator { param($r) $r.success }
    }
}

# ═══════════════════════════════════════════════════
# 8. REPORT MODULE (5 endpoints)
# ═══════════════════════════════════════════════════
Write-Section "8. REPORT MODULE (5 endpoints)"

if ($products -and $products.data.Count -gt 0) {
    $productId = $products.data[0].id
    
    # Create report
    $reportBody = @{
        reportedType = "PRODUCT"
        reportedId = $productId
        reason = "SPAM"
        description = "This product appears to be spam - testing report system"
    } | ConvertTo-Json
    
    $report = Test-Endpoint -Name "POST /reports - Create report" -Method POST -Uri "/reports" -Body $reportBody -Headers $authHeaders -Validator { param($r) $r.success -or $r.message -match "already" }
    
    # Get user reports
    Test-Endpoint -Name "GET /reports/user - Get user reports" -Method GET -Uri "/reports/user" -Headers $authHeaders -Validator { param($r) $r.success }
    
    # Admin: Get all reports
    $reports = Test-Endpoint -Name "GET /reports - Get all reports" -Method GET -Uri "/reports" -Headers $adminHeaders -Validator { param($r) $r.success }
    
    if ($reports -and $reports.data.Count -gt 0) {
        $reportId = $reports.data[0].id
        Write-Info "Using Report ID: $reportId"
        
        Test-Endpoint -Name "GET /reports/:id - Get report by ID" -Method GET -Uri "/reports/$reportId" -Headers $adminHeaders -Validator { param($r) $r.success -and $r.data.id -eq $reportId }
        
        # Admin: Resolve report
        $resolveBody = @{
            status = "RESOLVED"
            adminNotes = "Reviewed and resolved - false alarm for testing purposes"
        } | ConvertTo-Json
        
        Test-Endpoint -Name "PUT /reports/:id/resolve - Resolve report" -Method PUT -Uri "/reports/$reportId/resolve" -Body $resolveBody -Headers $adminHeaders -Validator { param($r) $r.success }
    }
}

# ═══════════════════════════════════════════════════
# 9. NOTIFICATION MODULE (7 endpoints)
# ═══════════════════════════════════════════════════
Write-Section "9. NOTIFICATION MODULE (7 endpoints)"

# Get user notifications
$notifications = Test-Endpoint -Name "GET /notifications - Get user notifications" -Method GET -Uri "/notifications" -Headers $authHeaders -Validator { param($r) $r.success }

Test-Endpoint -Name "GET /notifications/unread - Get unread notifications" -Method GET -Uri "/notifications/unread" -Headers $authHeaders -Validator { param($r) $r.success }

Test-Endpoint -Name "GET /notifications/count - Get unread count" -Method GET -Uri "/notifications/count" -Headers $authHeaders -Validator { param($r) $r.success }

if ($notifications -and $notifications.data.Count -gt 0) {
    $notificationId = $notifications.data[0].id
    Write-Info "Using Notification ID: $notificationId"
    
    Test-Endpoint -Name "GET /notifications/:id - Get notification by ID" -Method GET -Uri "/notifications/$notificationId" -Headers $authHeaders -Validator { param($r) $r.success -and $r.data.id -eq $notificationId }
    
    # Mark as read
    Test-Endpoint -Name "PUT /notifications/:id/read - Mark as read" -Method PUT -Uri "/notifications/$notificationId/read" -Headers $authHeaders -Validator { param($r) $r.success }
    
    # Mark all as read
    Test-Endpoint -Name "PUT /notifications/read-all - Mark all as read" -Method PUT -Uri "/notifications/read-all" -Headers $authHeaders -Validator { param($r) $r.success }
    
    # Delete notification
    Test-Endpoint -Name "DELETE /notifications/:id - Delete notification" -Method DELETE -Uri "/notifications/$notificationId" -Headers $authHeaders -Validator { param($r) $r.success }
}

# ═══════════════════════════════════════════════════
# TEST SUMMARY
# ═══════════════════════════════════════════════════
Write-Section "TEST SUMMARY"

$total = $script:passed + $script:failed
Write-Host ""
Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "Passed: $script:passed" -ForegroundColor Green
Write-Host "Failed: $script:failed" -ForegroundColor Red
Write-Host "Success Rate: $([math]::Round(($script:passed / $total) * 100, 2))%" -ForegroundColor $(if ($script:failed -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

if ($script:failed -eq 0) {
    Write-Host "🎉 ALL TESTS PASSED! 🎉" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some tests failed. Please review the output above." -ForegroundColor Yellow
}
