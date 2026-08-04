# E-MOORM API Comprehensive Testing Script (Fixed)
# Tests all endpoints across 9 modules

$ErrorActionPreference = "Continue"
$baseUrl = "http://localhost:3000/api"

# Test counters
$script:passed = 0
$script:failed = 0
$script:skipped = 0

function Write-Section { 
    param($msg) 
    Write-Host "`n===================================================" -ForegroundColor Magenta
    Write-Host "  $msg" -ForegroundColor Yellow
    Write-Host "===================================================" -ForegroundColor Magenta 
}

function Test-API {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers = @{},
        [string]$Body = $null,
        [scriptblock]$Validator = { param($r) $r.success }
    )
    
    try {
        $params = @{
            Uri = "$baseUrl$Uri"
            Method = $Method
            Headers = @{"Content-Type"="application/json"} + $Headers
        }
        
        if ($Body) { $params.Body = $Body }
        
        $response = Invoke-RestMethod @params
        
        if (& $Validator $response) {
            Write-Host "  + $Name" -ForegroundColor Green
            $script:passed++
            return $response
        } else {
            Write-Host "  - $Name - Validation failed" -ForegroundColor Red
            $script:failed++
            return $null
        }
    } catch {
        Write-Host "  ✗ $Name - $($_.Exception.Response.StatusDescription)" -ForegroundColor Red
        $script:failed++
        return $null
    }
}

# ==================================================
Write-Section "1. MUNICIPALITY MODULE"

$munics = Test-API "GET /municipalities" "GET" "/municipalities" -Validator { param($r) $r.success -and $r.data.Count -eq 15 }
$municId = $munics.data[0].id
Write-Host "    Using Municipality: $($munics.data[0].name) ($municId)" -ForegroundColor Cyan

Test-API "GET /municipalities/:id" "GET" "/municipalities/$municId" -Validator { param($r) $r.success -and $r.data.id -eq $municId }
Test-API "GET /municipalities/code/:code" "GET" "/municipalities/code/BACO" -Validator { param($r) $r.success }

# ═══════════════════════════════════════════════════
Write-Section "2. CATEGORY MODULE"

$cats = Test-API "GET /categories" "GET" "/categories" -Validator { param($r) $r.success -and $r.data.Count -eq 10 }
$catId = $cats.data[0].id
Write-Host "    Using Category: $($cats.data[0].name) ($catId)" -ForegroundColor Cyan

Test-API "GET /categories/:id" "GET" "/categories/$catId" -Validator { param($r) $r.success -and $r.data.id -eq $catId }
Test-API "GET /categories/slug/:slug" "GET" "/categories/slug/$($cats.data[0].slug)" -Validator { param($r) $r.success }

# ═══════════════════════════════════════════════════
Write-Section "3. AUTHENTICATION MODULE"

# Register Buyer
$buyerBody = @{
    email = "api.buyer@emoorm.com"
    password = "ApiBuyer123!@#"
    confirmPassword = "ApiBuyer123!@#"
    fullName = "API Test Buyer"
    contactNumber = "09171111111"
    municipalityId = $municId
    address = "111 Buyer St, Calapan City"
} | ConvertTo-Json

$buyerReg = Test-API "POST /auth/register (Buyer)" "POST" "/auth/register" -Body $buyerBody -Validator { param($r) $r.success -or $r.message -match "already exists" }

# Login Buyer
$buyerLoginBody = @{
    email = "api.buyer@emoorm.com"
    password = "ApiBuyer123!@#"
} | ConvertTo-Json

$buyerLogin = Test-API "POST /auth/login (Buyer)" "POST" "/auth/login" -Body $buyerLoginBody -Validator { param($r) $r.success -and $r.data.accessToken }

if ($buyerLogin) {
    $buyerToken = $buyerLogin.data.accessToken
    $buyerId = $buyerLogin.data.user.id
    Write-Host "    Buyer Token: $($buyerToken.Substring(0, 40))..." -ForegroundColor Cyan
}

# Register Seller
$sellerBody = @{
    email = "api.seller@emoorm.com"
    password = "ApiSeller123!@#"
    confirmPassword = "ApiSeller123!@#"
    fullName = "API Test Seller"
    contactNumber = "09172222222"
    municipalityId = $municId
    address = "222 Seller Ave, Calapan City"
} | ConvertTo-Json

Test-API "POST /auth/register (Seller)" "POST" "/auth/register" -Body $sellerBody -Validator { param($r) $r.success -or $r.message -match "already exists" }

# Login Seller
$sellerLoginBody = @{
    email = "api.seller@emoorm.com"
    password = "ApiSeller123!@#"
} | ConvertTo-Json

$sellerLogin = Test-API "POST /auth/login (Seller)" "POST" "/auth/login" -Body $sellerLoginBody -Validator { param($r) $r.success -and $r.data.accessToken }

if ($sellerLogin) {
    $sellerToken = $sellerLogin.data.accessToken
    $sellerId = $sellerLogin.data.user.id
    Write-Host "    Seller Token: $($sellerToken.Substring(0, 40))..." -ForegroundColor Cyan
}

# Register Admin
$adminBody = @{
    email = "api.admin@emoorm.com"
    password = "ApiAdmin123!@#"
    confirmPassword = "ApiAdmin123!@#"
    fullName = "API Test Admin"
    contactNumber = "09173333333"
    municipalityId = $municId
    address = "333 Admin Blvd, Calapan City"
} | ConvertTo-Json

Test-API "POST /auth/register (Admin)" "POST" "/auth/register" -Body $adminBody -Validator { param($r) $r.success -or $r.message -match "already exists" }

# Login Admin
$adminLoginBody = @{
    email = "api.admin@emoorm.com"
    password = "ApiAdmin123!@#"
} | ConvertTo-Json

$adminLogin = Test-API "POST /auth/login (Admin)" "POST" "/auth/login" -Body $adminLoginBody -Validator { param($r) $r.success -and $r.data.accessToken }

if ($adminLogin) {
    $adminToken = $adminLogin.data.accessToken
    $adminId = $adminLogin.data.user.id
    Write-Host "    Admin Token: $($adminToken.Substring(0, 40))..." -ForegroundColor Cyan
}

# Authenticated endpoints
if ($buyerToken) {
    $authHeaders = @{ "Authorization" = "Bearer $buyerToken" }
    
    Test-API "GET /auth/profile" "GET" "/auth/profile" -Headers $authHeaders -Validator { param($r) $r.success -and $r.data.email -eq "api.buyer@emoorm.com" }
    
    # Apply for seller
    $applyBody = @{
        businessName = "API Test Shop"
        businessDescription = "Test shop created via API testing"
        businessAddress = "444 Commerce St, Calapan City"
    } | ConvertTo-Json
    
    Test-API "POST /auth/apply-seller" "POST" "/auth/apply-seller" -Body $applyBody -Headers $authHeaders -Validator { param($r) $r.success -or $r.message -match "already" }
}

# Admin endpoints
if ($adminToken) {
    $adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
    
    $pending = Test-API "GET /auth/pending-sellers" "GET" "/auth/pending-sellers" -Headers $adminHeaders
    
    if ($pending -and $pending.data -and $pending.data.Count -gt 0) {
        $applicationId = $pending.data[0].id
        $approveBody = @{ approved = $true; reason = "Approved by API test" } | ConvertTo-Json
        Test-API "PUT /auth/approve-seller" "PUT" "/auth/approve-seller/$applicationId" -Body $approveBody -Headers $adminHeaders
    }
    
    Test-API "GET /auth/users" "GET" "/auth/users" -Headers $adminHeaders -Validator { param($r) $r.success -and $r.data.Count -gt 0 }
}

# ═══════════════════════════════════════════════════
Write-Section "4. STORE MODULE"

if ($sellerToken) {
    $sellerHeaders = @{ "Authorization" = "Bearer $sellerToken" }
    
    # Create store
    $storeBody = @{
        name = "API Test Store"
        description = "A test store created via API testing"
        address = "555 Shop Blvd, Calapan City"
        municipalityId = $municId
        contactNumber = "09172222222"
    } | ConvertTo-Json
    
    Test-API "POST /stores" "POST" "/stores" -Body $storeBody -Headers $sellerHeaders -Validator { param($r) $r.success -or $r.message -match "already" }
}

$stores = Test-API "GET /stores" "GET" "/stores"

if ($stores -and $stores.data -and $stores.data.Count -gt 0) {
    $storeId = $stores.data[0].id
    Write-Host "    Using Store: $($stores.data[0].name) ($storeId)" -ForegroundColor Cyan
    
    Test-API "GET /stores/:id" "GET" "/stores/$storeId"
    Test-API "GET /stores/seller/:id" "GET" "/stores/seller/$sellerId"
    Test-API "GET /stores/municipality/:id" "GET" "/stores/municipality/$municId"
    
    if ($sellerToken) {
        $sellerHeaders = @{ "Authorization" = "Bearer $sellerToken" }
        
        $updateStoreBody = @{
            description = "Updated store description via API test"
        } | ConvertTo-Json
        
        Test-API "PUT /stores/:id" "PUT" "/stores/$storeId" -Body $updateStoreBody -Headers $sellerHeaders
        
        Test-API "GET /stores/:id/products" "GET" "/stores/$storeId/products"
    }
    
    if ($adminToken) {
        $adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
        
        $verifyBody = @{ verified = $true; reason = "Verified by API test" } | ConvertTo-Json
        Test-API "PUT /stores/:id/verify" "PUT" "/stores/$storeId/verify" -Body $verifyBody -Headers $adminHeaders
    }
}

# ═══════════════════════════════════════════════════
Write-Section "5. PRODUCT MODULE"

if ($stores -and $stores.data -and $stores.data.Count -gt 0 -and $sellerToken) {
    $storeId = $stores.data[0].id
    $sellerHeaders = @{ "Authorization" = "Bearer $sellerToken" }
    
    $productBody = @{
        name = "API Test Product"
        description = "Test product created via API"
        price = 999.99
        stock = 50
        categoryId = $catId
        storeId = $storeId
    } | ConvertTo-Json
    
    Test-API "POST /products" "POST" "/products" -Body $productBody -Headers $sellerHeaders
}

$products = Test-API "GET /products" "GET" "/products"

if ($products -and $products.data -and $products.data.Count -gt 0) {
    $productId = $products.data[0].id
    Write-Host "    Using Product: $($products.data[0].name) ($productId)" -ForegroundColor Cyan
    
    Test-API "GET /products/:id" "GET" "/products/$productId"
    Test-API "GET /products/category/:id" "GET" "/products/category/$catId"
    Test-API "GET /products/store/:id" "GET" "/products/store/$storeId"
    Test-API "GET /products/featured" "GET" "/products/featured"
    
    if ($sellerToken) {
        $sellerHeaders = @{ "Authorization" = "Bearer $sellerToken" }
        
        $updateProductBody = @{
            description = "Updated product description"
            price = 1099.99
        } | ConvertTo-Json
        
        Test-API "PUT /products/:id" "PUT" "/products/$productId" -Body $updateProductBody -Headers $sellerHeaders
    }
    
    if ($adminToken) {
        $adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
        
        $approveProductBody = @{ approved = $true; reason = "Approved by API test" } | ConvertTo-Json
        Test-API "PUT /products/:id/approve" "PUT" "/products/$productId/approve" -Body $approveProductBody -Headers $adminHeaders
    }
    
    Test-API "GET /products/:id/reviews" "GET" "/products/$productId/reviews"
}

# ═══════════════════════════════════════════════════
Write-Section "6. ORDER MODULE"

if ($products -and $products.data -and $products.data.Count -gt 0 -and $buyerToken) {
    $productId = $products.data[0].id
    $authHeaders = @{ "Authorization" = "Bearer $buyerToken" }
    
    $orderBody = @{
        items = @(
            @{
                productId = $productId
                quantity = 2
                price = 1099.99
            }
        )
        deliveryAddress = "111 Buyer St, Calapan City"
        deliveryMunicipalityId = $municId
        contactNumber = "09171111111"
        notes = "Test order from API"
    } | ConvertTo-Json -Depth 3
    
    Test-API "POST /orders" "POST" "/orders" -Body $orderBody -Headers $authHeaders
    
    Test-API "GET /orders/buyer" "GET" "/orders/buyer" -Headers $authHeaders
}

if ($sellerToken) {
    $sellerHeaders = @{ "Authorization" = "Bearer $sellerToken" }
    Test-API "GET /orders/seller" "GET" "/orders/seller" -Headers $sellerHeaders
}

if ($buyerToken) {
    $authHeaders = @{ "Authorization" = "Bearer $buyerToken" }
    $orders = Test-API "GET /orders" "GET" "/orders" -Headers $authHeaders
    
    if ($orders -and $orders.data -and $orders.data.Count -gt 0) {
        $orderId = $orders.data[0].id
        Write-Host "    Using Order: $orderId" -ForegroundColor Cyan
        
        Test-API "GET /orders/:id" "GET" "/orders/$orderId" -Headers $authHeaders
    }
}

# ═══════════════════════════════════════════════════
Write-Section "7. REVIEW MODULE"

if ($orders -and $orders.data -and $orders.data.Count -gt 0 -and $buyerToken) {
    $orderId = $orders.data[0].id
    $productId = $orders.data[0].items[0].productId
    $authHeaders = @{ "Authorization" = "Bearer $buyerToken" }
    
    $reviewBody = @{
        productId = $productId
        orderId = $orderId
        rating = 5
        comment = "Excellent product! API test review."
    } | ConvertTo-Json
    
    Test-API "POST /reviews" "POST" "/reviews" -Body $reviewBody -Headers $authHeaders -Validator { param($r) $r.success -or $r.message -match "already" }
    
    Test-API "GET /reviews/product/:id" "GET" "/reviews/product/$productId"
    Test-API "GET /reviews/user" "GET" "/reviews/user" -Headers $authHeaders
    Test-API "GET /reviews/product/:id/stats" "GET" "/reviews/product/$productId/stats"
}

# ═══════════════════════════════════════════════════
Write-Section "8. REPORT MODULE"

if ($products -and $products.data -and $products.data.Count -gt 0 -and $buyerToken) {
    $productId = $products.data[0].id
    $authHeaders = @{ "Authorization" = "Bearer $buyerToken" }
    
    $reportBody = @{
        reportedType = "PRODUCT"
        reportedId = $productId
        reason = "SPAM"
        description = "Test report from API testing"
    } | ConvertTo-Json
    
    Test-API "POST /reports" "POST" "/reports" -Body $reportBody -Headers $authHeaders -Validator { param($r) $r.success -or $r.message -match "already" }
    
    Test-API "GET /reports/user" "GET" "/reports/user" -Headers $authHeaders
}

if ($adminToken) {
    $adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
    $reports = Test-API "GET /reports" "GET" "/reports" -Headers $adminHeaders
    
    if ($reports -and $reports.data -and $reports.data.Count -gt 0) {
        $reportId = $reports.data[0].id
        Write-Host "    Using Report: $reportId" -ForegroundColor Cyan
        
        Test-API "GET /reports/:id" "GET" "/reports/$reportId" -Headers $adminHeaders
        
        $resolveBody = @{
            status = "RESOLVED"
            adminNotes = "Resolved by API test"
        } | ConvertTo-Json
        
        Test-API "PUT /reports/:id/resolve" "PUT" "/reports/$reportId/resolve" -Body $resolveBody -Headers $adminHeaders
    }
}

# ═══════════════════════════════════════════════════
Write-Section "9. NOTIFICATION MODULE"

if ($buyerToken) {
    $authHeaders = @{ "Authorization" = "Bearer $buyerToken" }
    
    $notifications = Test-API "GET /notifications" "GET" "/notifications" -Headers $authHeaders
    Test-API "GET /notifications/unread" "GET" "/notifications/unread" -Headers $authHeaders
    Test-API "GET /notifications/count" "GET" "/notifications/count" -Headers $authHeaders
    
    if ($notifications -and $notifications.data -and $notifications.data.Count -gt 0) {
        $notificationId = $notifications.data[0].id
        Write-Host "    Using Notification: $notificationId" -ForegroundColor Cyan
        
        Test-API "GET /notifications/:id" "GET" "/notifications/$notificationId" -Headers $authHeaders
        Test-API "PUT /notifications/:id/read" "PUT" "/notifications/$notificationId/read" -Headers $authHeaders
        Test-API "PUT /notifications/read-all" "PUT" "/notifications/read-all" -Headers $authHeaders
        Test-API "DELETE /notifications/:id" "DELETE" "/notifications/$notificationId" -Headers $authHeaders
    }
}

# ═══════════════════════════════════════════════════
Write-Section "TEST SUMMARY"

$total = $script:passed + $script:failed + $script:skipped
Write-Host ""
Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "Passed: $script:passed" -ForegroundColor Green
Write-Host "Failed: $script:failed" -ForegroundColor Red
Write-Host "Skipped: $script:skipped" -ForegroundColor Yellow
Write-Host ""

$successRate = if ($total -gt 0) { [math]::Round(($script:passed / $total) * 100, 2) } else { 0 }
Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($script:failed -eq 0) { "Green" } elseif ($successRate -ge 80) { "Yellow" } else { "Red" })
Write-Host ""

if ($script:failed -eq 0) {
    Write-Host "ALL TESTS PASSED! E-MOORM Backend is fully functional!" -ForegroundColor Green
} elseif ($successRate -ge 80) {
    Write-Host "Most tests passed. Review failed tests above." -ForegroundColor Yellow
} else {
    Write-Host "Many tests failed. Please review the errors above." -ForegroundColor Red
}
