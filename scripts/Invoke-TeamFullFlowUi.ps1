[CmdletBinding()]
param(
    [string]$CredentialFile = 'D:\nexion\团队测试账号-20260829.md',
    [string]$BaseUrl = 'http://127.0.0.1:5173',
    [string]$ReferenceBaseUrl = 'http://127.0.0.1:5174',
    [string]$EvidenceDir = 'D:\nexion\团队模块全流程测试-20260829\证据\TEAM-20260829-A5'
)

$ErrorActionPreference = 'Stop'
$rows = Get-Content -LiteralPath $CredentialFile -Encoding UTF8 |
    Where-Object { $_ -match '^\|\s*团队测试-' }
$accounts = foreach ($row in $rows) {
    $cells = $row.Split('|') | ForEach-Object { $_.Trim() }
    if ($cells.Count -lt 6) { continue }
    [ordered]@{
        label = $cells[1]
        phone = '+86' + $cells[2].Trim('`')
        password = $cells[3].Trim('`')
    }
}
if (@($accounts).Count -ne 5) {
    throw "Expected five long-lived team accounts, found $(@($accounts).Count)."
}

$previousBase = $env:BASE_URL
$previousEvidence = $env:NEXGRID_EVIDENCE_DIR
$previousAccounts = $env:NEXGRID_TEAM_ACCOUNTS_JSON
$previousReference = $env:REFERENCE_BASE_URL
try {
    $env:BASE_URL = $BaseUrl
    $env:REFERENCE_BASE_URL = $ReferenceBaseUrl
    $env:NEXGRID_EVIDENCE_DIR = $EvidenceDir
    $env:NEXGRID_TEAM_ACCOUNTS_JSON = @($accounts) | ConvertTo-Json -Compress
    & node (Join-Path $PSScriptRoot 'team-full-flow-live-e2e.mjs')
    if ($LASTEXITCODE -ne 0) { throw "Team UI flow exited with code $LASTEXITCODE." }
} finally {
    $env:BASE_URL = $previousBase
    $env:NEXGRID_EVIDENCE_DIR = $previousEvidence
    $env:NEXGRID_TEAM_ACCOUNTS_JSON = $previousAccounts
    $env:REFERENCE_BASE_URL = $previousReference
}
