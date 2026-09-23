param([Parameter(Mandatory = $true)][string]$SevenZip)
# Validate the final Setup payload without touching an existing installation.
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskConfig = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw -Encoding utf8 | ConvertFrom-Json
$taskVersion = $taskConfig.version
if ($taskConfig.build.appId -ne 'io.github.torhansxd.onmyoji-lineup-atlas' -or $taskVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Unexpected application identity' }
$taskArtifact = $taskConfig.build.win.artifactName.Replace('${version}', $taskVersion).Replace('${ext}', 'exe')
$taskSetup = Join-Path $taskRoot (Join-Path 'release' $taskArtifact)
$taskRunId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$taskInstallerExtraction = [System.IO.Path]::GetFullPath((Join-Path $taskRoot "user-data\qa-setup-$taskVersion-$taskRunId"))
$taskPayload = [System.IO.Path]::GetFullPath((Join-Path $taskRoot "user-data\qa-payload-$taskVersion-$taskRunId"))
$taskProfile = [System.IO.Path]::GetFullPath((Join-Path $taskRoot "user-data\qa-profile-$taskVersion-payload-$taskRunId"))
foreach ($taskPath in @($taskInstallerExtraction, $taskPayload, $taskProfile)) {
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
        foreach ($taskName in @('阴阳师阵容图鉴.lnk', '御契.lnk')) {
            $taskLink = Join-Path $taskFolder $taskName
            $taskState[$taskLink] = if (Test-Path -LiteralPath $taskLink) { (Get-FileHash -LiteralPath $taskLink -Algorithm SHA256).Hash } else { $null }
        }
    }
    $taskState | ConvertTo-Json -Depth 6 -Compress
}
function Expand-ValidatedArchive([string]$archive, [string]$destination) {
    $taskListing = & $SevenZip l -slt $archive
    if ($LASTEXITCODE -ne 0) { throw "Cannot list archive: $archive" }
    $taskInEntries = $false
    foreach ($taskLine in $taskListing) {
        if ($taskLine -eq '----------') { $taskInEntries = $true; continue }
        if ($taskInEntries -and $taskLine.StartsWith('Path = ')) {
            $taskEntry = $taskLine.Substring(7)
            if ([System.IO.Path]::IsPathRooted($taskEntry)) { throw 'Absolute archive entry rejected' }
            $taskResolved = [System.IO.Path]::GetFullPath((Join-Path $destination $taskEntry))
            if (-not $taskResolved.StartsWith($destination + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escapes QA directory' }
        }
    }
    & $SevenZip x -bd -y "-o$destination" $archive | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Archive extraction failed: $archive" }
}
$taskExisting = Get-ExistingInstallState
$taskReport = [ordered]@{ version = $taskVersion; method = 'Final NSIS outer archive and embedded app-64.7z extraction, all-file hash comparison and packaged startup smoke'; install = 'not-run-existing-installation'; reinstall = 'not-run-existing-installation'; uninstall = 'not-run-existing-installation'; personalAccountFilesRead = $false; completed = $false }
try {
    Expand-ValidatedArchive $taskSetup $taskInstallerExtraction
    $taskAppArchive = Join-Path $taskInstallerExtraction '$PLUGINSDIR\app-64.7z'
    if (-not (Test-Path -LiteralPath $taskAppArchive)) { throw 'NSIS x64 application archive is missing' }
    Expand-ValidatedArchive $taskAppArchive $taskPayload
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
    $taskOriginalRaw = @($taskState.accounts | ForEach-Object { $_.raw | ConvertTo-Json -Depth 100 -Compress }) | ConvertTo-Json -Compress
    $env:ATLAS_SMOKE_USER_DATA = $taskProfile
    $env:ATLAS_SMOKE_OUTPUT = Join-Path $taskRoot "verification\electron-v$($taskVersion.Replace('.',''))-payload-smoke.json"
    $taskExe = Join-Path $taskPayload ($taskConfig.build.productName + '.exe')
    $taskReport.executableProduct = (Get-Item -LiteralPath $taskExe).VersionInfo.ProductName
    if ($taskReport.executableProduct -ne $taskConfig.build.productName) { throw 'Executable product branding is missing' }
    $taskProcess = Start-Process -FilePath $taskExe -ArgumentList '--smoke' -WorkingDirectory $taskRoot -WindowStyle Hidden -Wait -PassThru
    $taskSmoke = Get-Content -LiteralPath $env:ATLAS_SMOKE_OUTPUT -Raw -Encoding utf8 | ConvertFrom-Json
    if ($taskProcess.ExitCode -ne 0 -or $taskSmoke.error -or -not $taskSmoke.offline -or -not $taskSmoke.dataLoaded -or -not $taskSmoke.noAutomaticQR -or -not $taskSmoke.separateLogin -or -not $taskSmoke.returnOffline -or $taskSmoke.blockedOperations.Count -ne 2 -or -not $taskSmoke.loginModule.qrReady -or $taskSmoke.loginModule.servers -lt 100 -or -not $taskSmoke.loginModuleLoggedOut) { throw 'Packaged offline startup and explicit login verification failed' }
    $taskReport.packagedStartupSmoke = 'passed'
    $taskReport.startupFlow = $taskSmoke
    $taskAfterState = Get-Content -LiteralPath $taskStatePath -Raw -Encoding utf8 | ConvertFrom-Json
    $taskAfterRaw = @($taskAfterState.accounts | ForEach-Object { $_.raw | ConvertTo-Json -Depth 100 -Compress }) | ConvertTo-Json -Compress
    $taskReport.syntheticDataUnchanged = $taskAfterRaw -ceq $taskOriginalRaw
    if (-not $taskReport.syntheticDataUnchanged) { throw 'Synthetic account data changed before login' }
    $taskReport.completed = $true
} finally {
    $taskReport.existingInstallationPreserved = (Get-ExistingInstallState) -ceq $taskExisting
    $taskReport | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $taskRoot "verification\installer-v$($taskVersion.Replace('.','')).json") -Encoding utf8
}
if (-not $taskReport.existingInstallationPreserved) { throw 'Existing installation metadata changed' }
$taskReport | ConvertTo-Json -Depth 10
