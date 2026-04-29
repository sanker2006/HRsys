# HR-360 Sprint 1 API Test Script
# Encoded as UTF-8 with BOM for PowerShell 5.1 compatibility

$baseUrl = "http://localhost:3000"
$passed = 0
$failed = 0

function Test-Api {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers = @{},
    [string]$Body = "",
    [int]$ExpectStatus = 200,
    [int]$ExpectCode = 0,
    [switch]$ExpectFail,
    [scriptblock]$Validate = {}
  )

  try {
    $params = @{
      Uri = "$baseUrl$Uri"
      Method = $Method
      Headers = $Headers
      UseBasicParsing = $true
    }
    if ($Body) {
      $params.ContentType = "application/json; charset=utf-8"
      $params.Body = [System.Text.Encoding]::UTF8.GetBytes($Body)
    }

    $response = Invoke-WebRequest @params -ErrorAction Stop
    $data = $response.Content | ConvertFrom-Json

    if ($response.StatusCode -ne $ExpectStatus) {
      Write-Output "  [FAIL] $Name - HTTP $($response.StatusCode) (expected $ExpectStatus)"
      $script:failed++
      return $null
    }

    if (-not $ExpectFail -and $data.code -ne $ExpectCode) {
      Write-Output "  [FAIL] $Name - code=$($data.code) (expected $ExpectCode) msg=$($data.message)"
      $script:failed++
      return $null
    }

    if ($ExpectFail -and $data.code -eq 0) {
      Write-Output "  [FAIL] $Name - should have failed but code=0"
      $script:failed++
      return $null
    }

    if ($Validate -and -not $ExpectFail) {
      & $Validate $data
    }

    Write-Output "  [PASS] $Name"
    $script:passed++
    return $data
  } catch {
    $statusCode = 0
    if ($_.Exception.Response) {
      $statusCode = $_.Exception.Response.StatusCode.value__
    }

    if ($statusCode -eq $ExpectStatus) {
      Write-Output "  [PASS] $Name (HTTP $statusCode as expected)"
      $script:passed++
      return $null
    }

    Write-Output "  [FAIL] $Name - HTTP $statusCode (expected $ExpectStatus)"
    $script:failed++
    return $null
  }
}

Write-Output ""
Write-Output "=== 1. AUTH: Login ==="

$loginResult = Test-Api -Name "Admin login" -Method "Post" -Uri "/api/v1/auth/login" `
  -Body '{"account":"admin","password":"admin123"}' `
  -Validate { param($d) if (-not $d.data.token) { throw "No token" } }

if (-not $loginResult) { Write-Output "  FATAL: Admin login failed"; exit 1 }
$adminToken = $loginResult.data.token
$adminHeaders = @{ Authorization = "Bearer $adminToken" }

$h5Login = Test-Api -Name "H5 login (Li Si)" -Method "Post" -Uri "/api/v1/auth/h5-login" `
  -Body '{"phone":"13800138002","idCardTail":"5678"}' `
  -Validate { param($d) if (-not $d.data.token) { throw "No token" } }
$h5Token = $h5Login.data.token
$h5Headers = @{ Authorization = "Bearer $h5Token" }

Test-Api -Name "GET /auth/me (admin)" -Method "Get" -Uri "/api/v1/auth/me" `
  -Headers $adminHeaders `
  -Validate { param($d) if ($d.data.name -ne "系统管理员") { throw "Wrong: $($d.data.name)" } }

Test-Api -Name "GET /auth/me (H5)" -Method "Get" -Uri "/api/v1/auth/me" `
  -Headers $h5Headers `
  -Validate { param($d) if ($d.data.name -ne "李四") { throw "Wrong: $($d.data.name)" } }

Test-Api -Name "Login wrong password" -Method "Post" -Uri "/api/v1/auth/login" `
  -Body '{"account":"admin","password":"wrong"}' -ExpectFail

Test-Api -Name "H5 login wrong id" -Method "Post" -Uri "/api/v1/auth/h5-login" `
  -Body '{"phone":"13800138002","idCardTail":"0000"}' -ExpectFail

Write-Output ""
Write-Output "=== 2. PERMISSION ==="

Test-Api -Name "No token -> 401" -Method "Get" -Uri "/api/v1/user" -ExpectStatus 401
Test-Api -Name "Non-admin -> 403" -Method "Get" -Uri "/api/v1/user" -Headers $h5Headers -ExpectStatus 403
Test-Api -Name "Non-admin create -> 403" -Method "Post" -Uri "/api/v1/user" `
  -Headers $h5Headers -Body '{"name":"h","employee_no":"H","department":"X","level":"staff","id_card_tail":"0000"}' -ExpectStatus 403
Test-Api -Name "Non-admin delete -> 403" -Method "Delete" -Uri "/api/v1/user/1" -Headers $h5Headers -ExpectStatus 403

Write-Output ""
Write-Output "=== 3. USER CRUD ==="

$newUser = Test-Api -Name "Create user" -Method "Post" -Uri "/api/v1/user" `
  -Headers $adminHeaders `
  -Body '{"name":"TestUser","employee_no":"TST001","department":"TestDept","position":"Dev","level":"staff","phone":"13900001111","id_card_tail":"1234","is_admin":0}' `
  -Validate { param($d) if ($d.data.employee_no -ne "TST001") { throw "Wrong emp" } }
$newUserId = $newUser.data.id

Test-Api -Name "Get user list" -Method "Get" -Uri '/api/v1/user?page=1&pageSize=5' `
  -Headers $adminHeaders `
  -Validate { param($d) if ($d.data.total -lt 1) { throw "Empty list" } }

Test-Api -Name "Search keyword" -Method "Get" -Uri "/api/v1/user?keyword=TestUser&page=1&pageSize=20" `
  -Headers $adminHeaders `
  -Validate { param($d) if ($d.data.total -ne 1) { throw "Expected 1, got $($d.data.total)" } }

Test-Api -Name "Filter dept" -Method "Get" -Uri '/api/v1/user?department=TestDept' `
  -Headers $adminHeaders `
  -Validate { param($d) if ($d.data.total -lt 1) { throw "Filter failed" } }

Test-Api -Name "Filter level" -Method "Get" -Uri '/api/v1/user?level=staff' `
  -Headers $adminHeaders `
  -Validate { param($d) if ($d.data.total -lt 1) { throw "Filter failed" } }

Test-Api -Name "Update user" -Method "Put" -Uri "/api/v1/user/$newUserId" `
  -Headers $adminHeaders `
  -Body '{"name":"TestUserEdited","position":"Senior Dev"}' `
  -Validate { param($d) if ($d.data.name -ne "TestUserEdited") { throw "Update failed" } }

Test-Api -Name "Duplicate emp_no" -Method "Post" -Uri "/api/v1/user" `
  -Headers $adminHeaders `
  -Body '{"name":"dup","employee_no":"TST001","department":"X","level":"staff","id_card_tail":"0000"}' -ExpectFail

Write-Output ""
Write-Output "=== 4. IMPORT ==="

$importBody = '{"users":[{"name":"ImpA","employee_no":"IMP001","department":"Sales","position":"Rep","level":"staff","phone":"13800000001","id_card_tail":"1111","password":"h"},{"name":"ImpB","employee_no":"IMP002","department":"Sales","position":"Mgr","level":"manager","phone":"13800000002","id_card_tail":"2222","password":"h"}]}'

Test-Api -Name "Import 2 users" -Method "Post" -Uri "/api/v1/user/import" `
  -Headers $adminHeaders -Body $importBody `
  -Validate { param($d) if ($d.data.success -ne 2) { throw "Expected 2, got $($d.data.success)" } }

Test-Api -Name "Import duplicate" -Method "Post" -Uri "/api/v1/user/import" `
  -Headers $adminHeaders -Body $importBody

Write-Output ""
Write-Output "=== 5. EXPORT ==="

Test-Api -Name "Export all" -Method "Get" -Uri "/api/v1/user/export" `
  -Headers $adminHeaders `
  -Validate { param($d) if ($d.data.Count -lt 1) { throw "Export empty" } }

Test-Api -Name "Export filter" -Method "Get" -Uri '/api/v1/user/export?department=Sales' `
  -Headers $adminHeaders `
  -Validate { param($d) if ($d.data.Count -lt 2) { throw "Filter export failed" } }

Test-Api -Name "Get departments" -Method "Get" -Uri "/api/v1/user/departments" `
  -Headers $adminHeaders `
  -Validate { param($d) if ($d.data.Count -lt 1) { throw "No departments" } }

Write-Output ""
Write-Output "=== 6. DELETE ==="

Test-Api -Name "Delete non-existent -> 404" -Method "Delete" -Uri "/api/v1/user/99999" `
  -Headers $adminHeaders -ExpectStatus 404

Test-Api -Name "Delete admin" -Method "Delete" -Uri "/api/v1/user/1" `
  -Headers $adminHeaders -ExpectFail

Test-Api -Name "Delete normal user" -Method "Delete" -Uri "/api/v1/user/$newUserId" `
  -Headers $adminHeaders

Write-Output ""
Write-Output "========================================"
Write-Output "  Total: $($passed + $failed) | PASS: $passed | FAIL: $failed"
Write-Output "========================================"
if ($failed -gt 0) { exit 1 }
exit 0
