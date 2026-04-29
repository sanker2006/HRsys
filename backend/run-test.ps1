# HR-360 Sprint 1 集成测试脚本 (ASCII safe version)
$base = "http://localhost:3000"
$passed = 0
$failed = 0
$testResults = [System.Collections.ArrayList]::new()

function Test-Api {
    param(
        [string]$Name,
        [string]$Module,
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
        $params = @{ Uri = "$base$Uri"; Method = $Method; UseBasicParsing = $true; Headers = $Headers }
        if ($Body) {
            $params.ContentType = "application/json; charset=utf-8"
            $params.Body = [System.Text.Encoding]::UTF8.GetBytes($Body)
        }
        $response = Invoke-WebRequest @params -ErrorAction Stop
        $data = $response.Content | ConvertFrom-Json

        if ($response.StatusCode -ne $ExpectStatus) {
            Write-Output "  [FAIL] $Name - HTTP $($response.StatusCode) (expected $ExpectStatus)"
            $script:failed++
            [void]$script:testResults.Add([PSCustomObject]@{ Module=$Module; Name=$Name; Result="FAIL"; Detail="HTTP $($response.StatusCode) expected $ExpectStatus" })
            return $null
        }
        if ((-not $ExpectFail) -and ($data.code -ne $ExpectCode)) {
            Write-Output "  [FAIL] $Name - code=$($data.code) msg=$($data.message)"
            $script:failed++
            [void]$script:testResults.Add([PSCustomObject]@{ Module=$Module; Name=$Name; Result="FAIL"; Detail="code=$($data.code) $($data.message)" })
            return $null
        }
        if ($ExpectFail -and ($data.code -eq 0)) {
            Write-Output "  [FAIL] $Name - expected failure but code=0"
            $script:failed++
            [void]$script:testResults.Add([PSCustomObject]@{ Module=$Module; Name=$Name; Result="FAIL"; Detail="Expected fail but code=0" })
            return $null
        }
        if ($Validate -and (-not $ExpectFail)) {
            try { & $Validate $data }
            catch {
                Write-Output "  [FAIL] $Name - Validate: $_"
                $script:failed++
                [void]$script:testResults.Add([PSCustomObject]@{ Module=$Module; Name=$Name; Result="FAIL"; Detail="Validate: $_" })
                return $null
            }
        }
        Write-Output "  [PASS] $Name"
        $script:passed++
        [void]$script:testResults.Add([PSCustomObject]@{ Module=$Module; Name=$Name; Result="PASS"; Detail="" })
        return $data
    } catch {
        $statusCode = 0
        if ($_.Exception.Response) { $statusCode = $_.Exception.Response.StatusCode.value__ }
        if ($statusCode -eq $ExpectStatus) {
            Write-Output "  [PASS] $Name (HTTP $statusCode)"
            $script:passed++
            [void]$script:testResults.Add([PSCustomObject]@{ Module=$Module; Name=$Name; Result="PASS"; Detail="HTTP $statusCode" })
            return $null
        }
        Write-Output "  [FAIL] $Name - Exception HTTP=$statusCode $($_.Exception.Message)"
        $script:failed++
        [void]$script:testResults.Add([PSCustomObject]@{ Module=$Module; Name=$Name; Result="FAIL"; Detail="Exception HTTP=$statusCode" })
        return $null
    }
}

# ---- Step 1: Start backend ----
Write-Output ""
Write-Output "=== Starting backend ==="

$listening = netstat -ano 2>$null | Select-String "0.0.0.0:3000\s+\S+\s+LISTENING"
if ($listening) {
    Write-Output "  Backend already listening on :3000"
    $backendProc = $null
} else {
    Write-Output "  Launching npm run dev..."
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = "C:\Program Files\nodejs\node.exe"
    # npm-cli.js path
    $npmCli = "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"
    if (-not (Test-Path $npmCli)) {
        # try alternative location
        $npmCli = "$env:APPDATA\npm\node_modules\npm\bin\npm-cli.js"
    }
    $pinfo.Arguments = "`"$npmCli`" run dev"
    $pinfo.WorkingDirectory = "d:\HR-dev\hr-360\backend"
    $pinfo.UseShellExecute = $false
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true
    $backendProc = New-Object System.Diagnostics.Process
    $backendProc.StartInfo = $pinfo
    $backendProc.Start() | Out-Null
    Write-Output "  PID: $($backendProc.Id)"
    $ready = $false
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Seconds 1
        try {
            $r = Invoke-WebRequest -Uri "$base/api/v1/auth/login" -Method Post -ContentType "application/json" -Body '{"account":"admin","password":"admin123"}' -UseBasicParsing -ErrorAction Stop
            $ready = $true
            Write-Output "  Ready after $($i+1)s"
            break
        } catch {}
    }
    if (-not $ready) {
        Write-Output "[ERROR] Backend not ready after 25s"
        if ($backendProc) { $backendProc.Kill() }
        exit 1
    }
}

# ---- Step 2: AUTH ----
Write-Output ""
Write-Output "=== 1. AUTH ==="

$lr = Test-Api -Module "AUTH" -Name "Admin login" -Method "Post" -Uri "/api/v1/auth/login" -Body '{"account":"admin","password":"admin123"}' -Validate { param($d) if (-not $d.data.token) { throw "No token" } }
if (-not $lr) { Write-Output "FATAL: admin login failed"; exit 1 }
$adminToken = $lr.data.token
$ah = @{ Authorization = "Bearer $adminToken" }

# Ensure Li Si exists
$ck = Test-Api -Module "SETUP" -Name "Search EMP002" -Method "Get" -Uri "/api/v1/user?keyword=EMP002" -Headers $ah
if ($ck -and $ck.data.total -eq 0) {
    Write-Output "  Creating Li Si..."
    Test-Api -Module "SETUP" -Name "Create Li Si" -Method "Post" -Uri "/api/v1/user" -Headers $ah -Body '{"name":"\u674e\u56db","employee_no":"EMP002","department":"\u9500\u552e\u90e8","position":"\u9500\u552e\u4e13\u5458","level":"staff","phone":"13800138002","id_card_tail":"5678","is_admin":0}' | Out-Null
}

$h5r = Test-Api -Module "AUTH" -Name "H5 login" -Method "Post" -Uri "/api/v1/auth/h5-login" -Body '{"phone":"13800138002","idCardTail":"5678"}' -Validate { param($d) if (-not $d.data.token) { throw "No token" } }
$h5Token = if ($h5r) { $h5r.data.token } else { "" }
$hh = @{ Authorization = "Bearer $h5Token" }

Test-Api -Module "AUTH" -Name "GET /me admin" -Method "Get" -Uri "/api/v1/auth/me" -Headers $ah -Validate { param($d) if (-not $d.data.name) { throw "No name" } }
Test-Api -Module "AUTH" -Name "GET /me H5" -Method "Get" -Uri "/api/v1/auth/me" -Headers $hh -Validate { param($d) if (-not $d.data.name) { throw "No name" } }
Test-Api -Module "AUTH" -Name "Wrong password" -Method "Post" -Uri "/api/v1/auth/login" -Body '{"account":"admin","password":"wrong"}' -ExpectFail
Test-Api -Module "AUTH" -Name "H5 wrong id_card" -Method "Post" -Uri "/api/v1/auth/h5-login" -Body '{"phone":"13800138002","idCardTail":"0000"}' -ExpectFail
Test-Api -Module "AUTH" -Name "H5 invalid phone" -Method "Post" -Uri "/api/v1/auth/h5-login" -Body '{"phone":"12345","idCardTail":"5678"}' -ExpectFail
Test-Api -Module "AUTH" -Name "H5 invalid id_card" -Method "Post" -Uri "/api/v1/auth/h5-login" -Body '{"phone":"13800138002","idCardTail":"abc"}' -ExpectFail

# ---- Step 3: PERMISSION ----
Write-Output ""
Write-Output "=== 2. PERMISSION ==="

Test-Api -Module "PERM" -Name "No token -> 401" -Method "Get" -Uri "/api/v1/user" -ExpectStatus 401
Test-Api -Module "PERM" -Name "Non-admin GET -> 403" -Method "Get" -Uri "/api/v1/user" -Headers $hh -ExpectStatus 403
Test-Api -Module "PERM" -Name "Non-admin POST -> 403" -Method "Post" -Uri "/api/v1/user" -Headers $hh -Body '{"name":"x","employee_no":"x","department":"x","level":"staff","id_card_tail":"0000"}' -ExpectStatus 403
Test-Api -Module "PERM" -Name "Non-admin DELETE -> 403" -Method "Delete" -Uri "/api/v1/user/1" -Headers $hh -ExpectStatus 403
Test-Api -Module "PERM" -Name "Invalid token -> 401" -Method "Get" -Uri "/api/v1/user" -Headers @{ Authorization = "Bearer fake.token.abc" } -ExpectStatus 401

# ---- Step 4: USER CRUD ----
Write-Output ""
Write-Output "=== 3. USER CRUD ==="

$nu = Test-Api -Module "CRUD" -Name "Create user TST001" -Method "Post" -Uri "/api/v1/user" -Headers $ah -Body '{"name":"TestUser","employee_no":"TST001","department":"TestDept","position":"Dev","level":"staff","phone":"13900001111","id_card_tail":"1234","is_admin":0}' -Validate { param($d) if ($d.data.employee_no -ne "TST001") { throw "emp_no wrong" }; if ($d.data.password) { throw "password leaked" } }
$nid = if ($nu) { $nu.data.id } else { 0 }

Test-Api -Module "CRUD" -Name "List users" -Uri "/api/v1/user?page=1&pageSize=5" -Method "Get" -Headers $ah -Validate { param($d) if ($d.data.total -lt 1) { throw "empty" }; if ($d.data.list[0].password) { throw "pw leaked" } }
Test-Api -Module "CRUD" -Name "Search keyword TestUser" -Uri "/api/v1/user?keyword=TestUser&pageSize=20" -Method "Get" -Headers $ah -Validate { param($d) if ($d.data.total -lt 1) { throw "not found" } }
Test-Api -Module "CRUD" -Name "Filter dept=TestDept" -Uri "/api/v1/user?department=TestDept" -Method "Get" -Headers $ah -Validate { param($d) if ($d.data.total -lt 1) { throw "filter failed" } }
Test-Api -Module "CRUD" -Name "Filter level=staff" -Uri "/api/v1/user?level=staff" -Method "Get" -Headers $ah -Validate { param($d) if ($d.data.total -lt 1) { throw "filter failed" } }

if ($nid -gt 0) {
    Test-Api -Module "CRUD" -Name "Update user name" -Method "Put" -Uri "/api/v1/user/$nid" -Headers $ah -Body '{"name":"TestUserEdited"}' -Validate { param($d) if ($d.data.name -ne "TestUserEdited") { throw "update failed" } }
}

Test-Api -Module "CRUD" -Name "Dup emp_no -> fail" -Method "Post" -Uri "/api/v1/user" -Headers $ah -Body '{"name":"dup","employee_no":"TST001","department":"X","level":"staff","id_card_tail":"0000"}' -ExpectFail
Test-Api -Module "CRUD" -Name "Dup phone+id_card -> fail" -Method "Post" -Uri "/api/v1/user" -Headers $ah -Body '{"name":"dup2","employee_no":"DUP999","department":"X","level":"staff","phone":"13900001111","id_card_tail":"1234"}' -ExpectFail
Test-Api -Module "CRUD" -Name "Missing required fields" -Method "Post" -Uri "/api/v1/user" -Headers $ah -Body '{"name":"NoEmp"}' -ExpectFail
Test-Api -Module "CRUD" -Name "Update non-existent -> 404" -Method "Put" -Uri "/api/v1/user/99999" -Headers $ah -Body '{"name":"ghost"}' -ExpectStatus 404

# ---- Step 5: IMPORT ----
Write-Output ""
Write-Output "=== 4. IMPORT ==="

$ib = '{"users":[{"name":"ImpA","employee_no":"IMP001","department":"Sales","position":"Rep","level":"staff","phone":"13800000001","id_card_tail":"1111"},{"name":"ImpB","employee_no":"IMP002","department":"Sales","position":"Mgr","level":"manager","phone":"13800000002","id_card_tail":"2222"}]}'
Test-Api -Module "IMPORT" -Name "Import 2 users" -Method "Post" -Uri "/api/v1/user/import" -Headers $ah -Body $ib -Validate { param($d) if ($d.data.success -ne 2) { throw "Expected 2 got $($d.data.success)" } }
Test-Api -Module "IMPORT" -Name "Import duplicates (0 success)" -Method "Post" -Uri "/api/v1/user/import" -Headers $ah -Body $ib -Validate { param($d) if ($d.data.success -ne 0) { throw "Expected 0 got $($d.data.success)" } }
Test-Api -Module "IMPORT" -Name "Import non-array -> fail" -Method "Post" -Uri "/api/v1/user/import" -Headers $ah -Body '{"users":"bad"}' -ExpectFail

# ---- Step 6: EXPORT ----
Write-Output ""
Write-Output "=== 5. EXPORT ==="

Test-Api -Module "EXPORT" -Name "Export all" -Method "Get" -Uri "/api/v1/user/export" -Headers $ah -Validate { param($d) if ($d.data.Count -lt 1) { throw "empty" }; if ($d.data[0].password) { throw "pw leaked" } }
Test-Api -Module "EXPORT" -Name "Export dept=Sales" -Method "Get" -Uri "/api/v1/user/export?department=Sales" -Headers $ah -Validate { param($d) if ($d.data.Count -lt 2) { throw "expected >=2 got $($d.data.Count)" } }
Test-Api -Module "EXPORT" -Name "Export level=staff" -Method "Get" -Uri "/api/v1/user/export?level=staff" -Headers $ah -Validate { param($d) if ($d.data.Count -lt 1) { throw "empty" } }
Test-Api -Module "EXPORT" -Name "Get departments" -Method "Get" -Uri "/api/v1/user/departments" -Headers $ah -Validate { param($d) if ($d.data.Count -lt 1) { throw "no depts" } }

# ---- Step 7: DELETE ----
Write-Output ""
Write-Output "=== 6. DELETE ==="

Test-Api -Module "DELETE" -Name "Delete non-existent -> 404" -Method "Delete" -Uri "/api/v1/user/99999" -Headers $ah -ExpectStatus 404
Test-Api -Module "DELETE" -Name "Delete admin -> fail" -Method "Delete" -Uri "/api/v1/user/1" -Headers $ah -ExpectFail

if ($nid -gt 0) {
    Test-Api -Module "DELETE" -Name "Delete normal user" -Method "Delete" -Uri "/api/v1/user/$nid" -Headers $ah -Validate { param($d) if ($d.code -ne 0) { throw "del failed" } }
    Test-Api -Module "DELETE" -Name "Delete again -> 404" -Method "Delete" -Uri "/api/v1/user/$nid" -Headers $ah -ExpectStatus 404
}

# ---- Result ----
Write-Output ""
Write-Output "========================================"
Write-Output "  TOTAL: $($passed + $failed)  PASS: $passed  FAIL: $failed"
Write-Output "========================================"

if ($backendProc -and (-not $backendProc.HasExited)) { $backendProc.Kill(); Write-Output "Backend stopped" }

# ---- Write report ----
$now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$total = $passed + $failed
$rate = if ($total -gt 0) { [math]::Round($passed * 100.0 / $total, 1) } else { 0 }

$modLines = $testResults | Where-Object { $_.Module -notin @("SETUP") } | Group-Object Module | ForEach-Object {
    $p = ($_.Group | Where-Object { $_.Result -eq "PASS" }).Count
    $f = ($_.Group | Where-Object { $_.Result -eq "FAIL" }).Count
    "| $($_.Name) | $($_.Count) | $p | $f | $(if($f -eq 0){'`u2705'}else{'`u274c'}) |"
}

$detailLines = $testResults | Where-Object { $_.Module -notin @("SETUP") } | ForEach-Object {
    $icon = if ($_.Result -eq "PASS") { "PASS" } else { "FAIL" }
    "| $($_.Module) | $($_.Name) | $icon | $($_.Detail) |"
}

$failLines = $testResults | Where-Object { $_.Result -eq "FAIL" }
$failSection = if ($failLines.Count -eq 0) { "无失败用例，全部通过。" } else {
    ($failLines | ForEach-Object { "- **[$($_.Module)] $($_.Name)**: $($_.Detail)" }) -join "`n"
}

$verdict = if ($failed -eq 0) { "全部通过 — Sprint 1 后端 API 功能正常，可进入 Sprint 2 开发。" } elseif ($failed -le 3) { "少量失败，建议修复后进入 Sprint 2。" } else { "多个失败，需重点排查。" }

$report = "# HR-360 测试报告 — Sprint 1`n`n" +
"> 测试时间：$now  `n" +
"> 测试方式：PowerShell 集成测试（HTTP 直接请求）  `n" +
"> 测试范围：Sprint 1 后端 API（Auth + User CRUD + Import/Export）`n`n" +
"---`n`n" +
"## 一、测试概况`n`n" +
"| 指标 | 值 |`n|------|-----|`n" +
"| 总用例 | $total |`n" +
"| 通过 | $passed |`n" +
"| 失败 | $failed |`n" +
"| 通过率 | $rate% |`n`n" +
"---`n`n" +
"## 二、各模块结果`n`n" +
"| 模块 | 用例数 | 通过 | 失败 | 状态 |`n|------|:------:|:----:|:----:|:----:|`n" +
(($modLines) -join "`n") + "`n`n" +
"---`n`n" +
"## 三、用例明细`n`n" +
"| 模块 | 用例 | 结果 | 备注 |`n|------|------|:----:|------|`n" +
(($detailLines) -join "`n") + "`n`n" +
"---`n`n" +
"## 四、失败分析`n`n" +
$failSection + "`n`n" +
"---`n`n" +
"## 五、结论`n`n" +
$verdict + "`n`n" +
"### 已验证功能清单`n`n" +
"- Admin 登录 / H5 登录`n" +
"- JWT auth 中间件（401）`n" +
"- admin 权限中间件（403）`n" +
"- 用户 CRUD（含脱敏、唯一性校验）`n" +
"- 分页 + 多条件筛选`n" +
"- 批量导入（部分成功 + 错误收集）`n" +
"- 导出 + 部门列表`n" +
"- phone+id_card_tail 组合唯一性约束`n"

$reportPath = "d:\HR开发\docs\测试报告-Sprint1.md"
[System.IO.File]::WriteAllText($reportPath, $report, [System.Text.Encoding]::UTF8)
Write-Output "Report saved: $reportPath"

exit $(if ($failed -gt 0) { 1 } else { 0 })
