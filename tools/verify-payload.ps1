param([Parameter(Mandatory = $true)][string]$SevenZip)
# Validate the final Setup payload without touching an existing installation.
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskConfig = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw -Encoding utf8 | ConvertFrom-Json
$taskVersion = $taskConfig.version
if ($taskConfig.build.appId -ne 'io.github.torhansxd.onmyoji-lineup-atlas' -or $taskVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Unexpected application identity' }
$taskSetup = Join-Path $taskRoot "release\Onmyoji-Lineup-Atlas-Setup-$taskVersion-Windows-x64.exe"
$taskPayload = [System.IO.Path]::GetFullPath((Join-Path $taskRoot "user-data\qa-payload-$taskVersion"))
$taskProfile = [System.IO.Path]::GetFullPath((Join-Path $taskRoot "user-data\qa-profile-$taskVersion-payload"))
foreach ($taskPath in @($taskPayload, $taskProfile)) {
    if (-not $taskPath.StartsWith($taskRoot + '\', [System.StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $taskPath)) { throw "QA directory must be new and inside workspace: $taskPath" }
}
function Get-ExistingInstallState {
    $taskGuid = '1187f02f-4b23-5c32-94fb-25338287150d'
    $taskState = [ordered]@{}
    foreach ($taskHive in @('HKCU:', 'HKLM:')) {
        foreach ($taskSubkey in @("Software\$taskGuid", "Software\Microsoft\Windows\CurrentVersion\Uninstall\$taskGuid")) {
            $taskKey = "$taskHive\$taskSubkey"
            $taskState[$taskKey] = if (Test-Path -LiteralPath $taskKey) { Get-ItemProperty -LiteralPath $taskKey | Select-Object DisplayVersion, InstallLocation, DisplayName, UninstallString } else { $null }
        }
    }
    foreach ($taskFolder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
        $taskLink = Join-Path $taskFolder '阴阳师阵容图鉴.lnk'
        $taskState[$taskLink] = if (Test-Path -LiteralPath $taskLink) { (Get-FileHash -LiteralPath $taskLink -Algorithm SHA256).Hash } else { $null }
    }
    $taskState | ConvertTo-Json -Depth 6 -Compress
}
$taskExisting = Get-ExistingInstallState
$taskReport = [ordered]@{ version = $taskVersion; method = 'Final NSIS payload extraction, all-file hash comparison and packaged startup smoke'; install = 'not-run-existing-installation'; reinstall = 'not-run-existing-installation'; uninstall = 'not-run-existing-installation'; personalAccountFilesRead = $false; completed = $false }
try {
    $taskListing = & $SevenZip l -slt $taskSetup
    if ($LASTEXITCODE -ne 0) { throw 'Cannot list final Setup payload' }
    $taskInEntries = $false
    foreach ($taskLine in $taskListing) {
        if ($taskLine -eq '----------') { $taskInEntries = $true; continue }
        if ($taskInEntries -and $taskLine.StartsWith('Path = ')) {
            $taskEntry = $taskLine.Substring(7)
            if ([System.IO.Path]::IsPathRooted($taskEntry)) { throw 'Absolute archive entry rejected' }
            $taskResolved = [System.IO.Path]::GetFullPath((Join-Path $taskPayload $taskEntry))
            if (-not $taskResolved.StartsWith($taskPayload + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escapes QA directory' }
        }
    }
    & $SevenZip x -bd -y "-o$taskPayload" $taskSetup | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Final Setup payload extraction failed' }
    $taskSource = [System.IO.Path]::GetFullPath((Join-Path $taskRoot 'release\win-unpacked'))
    $taskSourceFiles = @(Get-ChildItem -LiteralPath $taskSource -File -Recurse)
    $taskExtractedFiles = @(Get-ChildItem -LiteralPath $taskPayload -File -Recurse)
    if ($taskSourceFiles.Count -ne $taskExtractedFiles.Count) { throw 'Payload file count differs from build' }
    foreach ($taskFile in $taskSourceFiles) {
        $taskRelative = $taskFile.FullName.Substring($taskSource.Length + 1)
        $taskExtracted = Join-Path $taskPayload $taskRelative
        if (-not (Test-Path -LiteralPath $taskExtracted) -or (Get-FileHash -LiteralPath $taskExtracted).Hash -ne (Get-FileHash -LiteralPath $taskFile.FullName).Hash) { throw "Payload differs from build: $taskRelative" }
    }
    $taskReport.payloadFiles = $taskSourceFiles.Count
    $taskReport.allPayloadFilesMatch = $true
    New-Item -ItemType Directory -Path $taskProfile | Out-Null
    $taskFixture = Get-Content -LiteralPath (Join-Path $taskRoot 'verification\fixtures\mixed-backup-v030.json') -Raw -Encoding utf8 | ConvertFrom-Json
    $taskState = @{ schemaVersion = 1; accounts = $taskFixture.accounts; activeAccount = $taskFixture.accounts[0].id; lineups = @($taskFixture.lineups | Where-Object { $_.code -and $_.code.Trim() }) }
    $taskStatePath = Join-Path $taskProfile 'library-v1.json'
    [System.IO.File]::WriteAllText($taskStatePath, ($taskState | ConvertTo-Json -Depth 100), [System.Text.UTF8Encoding]::new($false))
    $taskStateHash = (Get-FileHash -LiteralPath $taskStatePath).Hash
    $env:ATLAS_SMOKE_USER_DATA = $taskProfile
    $env:ATLAS_SMOKE_OUTPUT = Join-Path $taskRoot "verification\electron-v$($taskVersion.Replace('.',''))-payload-smoke.json"
    $taskProcess = Start-Process -FilePath (Join-Path $taskPayload '阴阳师阵容图鉴.exe') -ArgumentList '--smoke' -WorkingDirectory $taskRoot -WindowStyle Hidden -Wait -PassThru
    $taskSmoke = Get-Content -LiteralPath $env:ATLAS_SMOKE_OUTPUT -Raw -Encoding utf8 | ConvertFrom-Json
    if ($taskProcess.ExitCode -ne 0 -or $taskSmoke.error -or -not $taskSmoke.gateVisible -or -not $taskSmoke.appHidden -or -not $taskSmoke.appInert -or $taskSmoke.dataLoaded -or $taskSmoke.blockedOperations.Count -ne 9 -or -not $taskSmoke.loginModule.qrReady -or $taskSmoke.loginModule.servers -lt 100 -or -not $taskSmoke.loginModuleLoggedOut) { throw 'Packaged startup gate verification failed' }
    $taskReport.packagedStartupSmoke = 'passed'
    $taskReport.startupGate = $taskSmoke
    $taskReport.syntheticDataUnchanged = (Get-FileHash -LiteralPath $taskStatePath).Hash -eq $taskStateHash
    if (-not $taskReport.syntheticDataUnchanged) { throw 'Synthetic account data changed before login' }
    $taskReport.completed = $true
} finally {
    $taskReport.existingInstallationPreserved = (Get-ExistingInstallState) -ceq $taskExisting
    $taskReport | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $taskRoot "verification\installer-v$($taskVersion.Replace('.','')).json") -Encoding utf8
}
if (-not $taskReport.existingInstallationPreserved) { throw 'Existing installation metadata changed' }
$taskReport | ConvertTo-Json -Depth 10
