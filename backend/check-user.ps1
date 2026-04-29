# 检查李四是否存在，不存在则创建
$base = "http://localhost:3000"

# 1. 管理员登录
$loginBody = [System.Text.Encoding]::UTF8.GetBytes('{"account":"admin","password":"admin123"}')
$loginResp = Invoke-WebRequest -Uri "$base/api/v1/auth/login" -Method Post -ContentType "application/json; charset=utf-8" -Body $loginBody -UseBasicParsing
$loginData = $loginResp.Content | ConvertFrom-Json
$token = $loginData.data.token
Write-Output "Admin 登录: $($loginData.message), token 前20位=$($token.Substring(0,20))..."

$headers = @{ Authorization = "Bearer $token" }

# 2. 搜索李四
$searchResp = Invoke-WebRequest -Uri "$base/api/v1/user?keyword=%E6%9D%8E%E5%9B%9B&pageSize=20" -Method Get -Headers $headers -UseBasicParsing
$searchData = $searchResp.Content | ConvertFrom-Json
Write-Output "搜索李四: total=$($searchData.data.total)"

if ($searchData.data.total -eq 0) {
    Write-Output "李四不存在，创建中..."
    $createBody = [System.Text.Encoding]::UTF8.GetBytes('{"name":"李四","employee_no":"EMP002","department":"销售部","position":"销售专员","level":"staff","phone":"13800138002","id_card_tail":"5678","is_admin":0}')
    $createResp = Invoke-WebRequest -Uri "$base/api/v1/user" -Method Post -ContentType "application/json; charset=utf-8" -Body $createBody -Headers $headers -UseBasicParsing
    $createData = $createResp.Content | ConvertFrom-Json
    Write-Output "创建结果: code=$($createData.code), msg=$($createData.message)"
} else {
    Write-Output "李四已存在，ID=$($searchData.data.list[0].id), phone=$($searchData.data.list[0].phone)"
}
