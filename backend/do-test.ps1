# HR-360 Sprint1 Integration Test Script (v2)
# All business errors use code:-1; auth errors use HTTP 401 with code:-1

$BASE = "http://127.0.0.1:3000/api/v1"
$pass = 0
$fail = 0
$results = @()

function Req {
    param($name, $method, $url, $body, $token, $wantCode, $wantMsg)
    $headers = @{ "Content-Type" = "application/json" }
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    try {
        if ($body) {
            $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
            $resp = Invoke-WebRequest -Uri $url -Method $method -Headers $headers -Body $bodyBytes -UseBasicParsing -ErrorAction Stop
        } else {
            $resp = Invoke-WebRequest -Uri $url -Method $method -Headers $headers -UseBasicParsing -ErrorAction Stop
        }
        $json = $resp.Content | ConvertFrom-Json
        $actual = $json.code
        $msg = $json.message
        if ($actual -eq $wantCode) {
            $script:pass++
            return @{ name=$name; status="PASS"; code=$actual; msg=$msg; data=$json.data }
        } else {
            $script:fail++
            return @{ name=$name; status="FAIL"; code=$actual; msg="Got code=$actual msg=$msg, want code=$wantCode"; data=$json.data }
        }
    } catch {
        # HTTP error response - parse body
        $statusCode = $null
        $errBody = $null
        if ($_.Exception.Response) {
            try {
                $statusCode = [int]$_.Exception.Response.StatusCode
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errBody = $reader.ReadToEnd() | ConvertFrom-Json
            } catch {}
        }
        $actual = if ($errBody) { $errBody.code } else { "ERR" }
        $msg = if ($errBody) { $errBody.message } else { $_.Exception.Message }
        if ($actual -eq $wantCode) {
            $script:pass++
            return @{ name=$name; status="PASS"; code=$actual; msg=$msg; data=$null }
        } else {
            $script:fail++
            return @{ name=$name; status="FAIL"; code=$actual; msg="Got code=$actual msg=$msg, want code=$wantCode"; data=$null }
        }
    }
}

Write-Host "=== HR-360 Sprint1 Integration Test ===" -ForegroundColor Cyan

# ===== AUTH =====
Write-Host "`n[AUTH MODULE]"

# T01: Admin login success
$r = Req "T01 Admin login success" "POST" "$BASE/auth/login" '{"account":"admin","password":"admin123"}' $null 0
$results += $r; $adminToken = $r.data.token
Write-Host "[$($r.status)] $($r.name)"

# T02: Wrong password -> code:-1
$r = Req "T02 Wrong password" "POST" "$BASE/auth/login" '{"account":"admin","password":"wrongpass"}' $null -1
$results += $r
Write-Host "[$($r.status)] $($r.name): $($r.msg)"

# T03: H5 login success (field: idCardTail camelCase)
$r = Req "T03 H5 login success" "POST" "$BASE/auth/h5-login" '{"phone":"13800138001","idCardTail":"1234"}' $null 0
$results += $r; $h5Token = $r.data.token
Write-Host "[$($r.status)] $($r.name): $($r.msg)"

# T04: H5 login wrong id_card
$r = Req "T04 H5 wrong id tail" "POST" "$BASE/auth/h5-login" '{"phone":"13800138001","idCardTail":"9999"}' $null -1
$results += $r
Write-Host "[$($r.status)] $($r.name): $($r.msg)"

# T05: Get Me (admin)
$r = Req "T05 Get Me admin" "GET" "$BASE/auth/me" $null $adminToken 0
$results += $r
Write-Host "[$($r.status)] $($r.name): role=$($r.data.is_admin)"

# T06: Get Me no token -> code:-1
$r = Req "T06 No token -> denied" "GET" "$BASE/auth/me" $null $null -1
$results += $r
Write-Host "[$($r.status)] $($r.name): $($r.msg)"

# ===== USER =====
Write-Host "`n[USER MODULE]"

# T07: User list
$r = Req "T07 User list" "GET" "$BASE/user?page=1&pageSize=10" $null $adminToken 0
$results += $r; $initialTotal = $r.data.total
Write-Host "[$($r.status)] $($r.name): total=$initialTotal"

# T08: Create user (use timestamp to avoid conflict)
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$phone = "188" + ($ts % 100000000).ToString().PadLeft(8,'0')
$empNo = "TEST$ts"
$newUser = "{`"name`":`"TestQA`",`"employee_no`":`"$empNo`",`"department`":`"QADept`",`"position`":`"QAEngineer`",`"level`":`"staff`",`"phone`":`"$phone`",`"id_card_tail`":`"8888`",`"is_admin`":0}"
$r = Req "T08 Create user" "POST" "$BASE/user" $newUser $adminToken 0
$results += $r; $newUserId = $r.data.id
Write-Host "[$($r.status)] $($r.name): id=$newUserId phone=$phone"

# T09: Duplicate phone -> code:-1
$dupUser = "{`"name`":`"TestQA_B`",`"employee_no`":`"${empNo}B`",`"department`":`"QADept`",`"position`":`"QAEngineer`",`"level`":`"staff`",`"phone`":`"$phone`",`"id_card_tail`":`"7777`",`"is_admin`":0}"
$r = Req "T09 Dup phone -> error" "POST" "$BASE/user" $dupUser $adminToken -1
$results += $r
Write-Host "[$($r.status)] $($r.name): $($r.msg)"

# T10: Update user
if ($newUserId) {
    $r = Req "T10 Update user" "PUT" "$BASE/user/$newUserId" '{"position":"SeniorQA"}' $adminToken 0
    $results += $r
    Write-Host "[$($r.status)] $($r.name): $($r.msg)"
} else {
    $results += @{ name="T10 Update user"; status="SKIP"; code="-"; msg="no id" }
    Write-Host "[SKIP] T10 Update user"
}

# T11: Filter search
$r = Req "T11 Search by dept" "GET" "$BASE/user?department=QADept&page=1&pageSize=10" $null $adminToken 0
$results += $r
Write-Host "[$($r.status)] $($r.name): found=$($r.data.total)"

# T12: Get departments
$r = Req "T12 Get departments" "GET" "$BASE/user/departments" $null $adminToken 0
$results += $r
Write-Host "[$($r.status)] $($r.name): count=$($r.data.Count)"

# T13: Export CSV
try {
    $resp = Invoke-WebRequest -Uri "$BASE/user/export" -Method GET -Headers @{Authorization="Bearer $adminToken"} -UseBasicParsing -ErrorAction Stop
    if ($resp.StatusCode -eq 200 -and $resp.Content.Length -gt 0) {
        $pass++
        $r = @{ name="T13 Export CSV"; status="PASS"; code=200; msg="bytes=$($resp.RawContentLength)"; data=$null }
    } else {
        $fail++
        $r = @{ name="T13 Export CSV"; status="FAIL"; code=$resp.StatusCode; msg="empty or wrong status"; data=$null }
    }
} catch {
    $fail++
    $r = @{ name="T13 Export CSV"; status="FAIL"; code="ERR"; msg=$_.Exception.Message; data=$null }
}
$results += $r
Write-Host "[$($r.status)] $($r.name): $($r.msg)"

# T14: Delete user
if ($newUserId) {
    $r = Req "T14 Delete user" "DELETE" "$BASE/user/$newUserId" $null $adminToken 0
    $results += $r
    Write-Host "[$($r.status)] $($r.name): $($r.msg)"
} else {
    $results += @{ name="T14 Delete user"; status="SKIP"; code="-"; msg="no id" }
    Write-Host "[SKIP] T14 Delete user"
}

# T15: Delete non-existent -> code:-1
$r = Req "T15 Delete 404" "DELETE" "$BASE/user/99999" $null $adminToken -1
$results += $r
Write-Host "[$($r.status)] $($r.name): $($r.msg)"

# T16: Verify count restored after delete
$r = Req "T16 Count restored" "GET" "$BASE/user?page=1&pageSize=10" $null $adminToken 0
$results += $r
$finalTotal = $r.data.total
$countOK = if ($finalTotal -eq $initialTotal) { "PASS" } else { "FAIL" }
if ($countOK -eq "PASS") { $pass++ } else { $fail++ }
$r2 = @{ name="T16 Count restored"; status=$countOK; code=0; msg="initial=$initialTotal final=$finalTotal"; data=$null }
$results += $r2
$results = $results | Where-Object { $_.name -ne "T16 Count restored" }
$results += $r2
Write-Host "[$countOK] T16 Count restored: initial=$initialTotal final=$finalTotal"

# ===== SUMMARY =====
$total = $pass + $fail
Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  PASS: $pass   FAIL: $fail   TOTAL: $total" -ForegroundColor $(if($fail -eq 0){"Green"}else{"Yellow"})
Write-Host "==================================" -ForegroundColor Cyan

# Save JSON for report
$report = @{ runTime=(Get-Date).ToString("yyyy-MM-dd HH:mm:ss"); pass=$pass; fail=$fail; total=$total; results=$results }
$json = $report | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText("d:\HR\test-result.json", $json, [System.Text.Encoding]::UTF8)
Write-Host "Results saved."
