# Validate the actual Setup artifact in an isolated install directory. Refuse to
# overwrite an existing installation or shortcuts. Never read personal accounts.
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskConfig = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw -Encoding utf8 | ConvertFrom-Json
if ($taskConfig.build.appId -ne 'io.github.torhansxd.onmyoji-lineup-atlas' -or $taskConfig.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Unexpected application identity' }
$taskVersion = $taskConfig.version
$taskGuid = '1187f02f-4b23-5c32-94fb-25338287150d'
$taskInstallDir = [System.IO.Path]::GetFullPath((Join-Path $taskRoot "user-data\qa-installer-$taskVersion\安装测试 onmyoji-lineup-atlas"))
$taskProfileDir = [System.IO.Path]::GetFullPath((Join-Path $taskRoot "user-data\qa-profile-$taskVersion"))
foreach ($taskPath in @($taskInstallDir, $taskProfileDir)) {
    if (-not $taskPath.StartsWith($taskRoot + '\', [System.StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $taskPath)) { throw "QA path must be new and inside the workspace: $taskPath" }
}
$taskSetup = Join-Path $taskRoot "release\Onmyoji-Lineup-Atlas-Setup-$taskVersion-Windows-x64.exe"
$taskApp = Join-Path $taskInstallDir '阴阳师阵容图鉴.exe'
$taskUninstaller = Join-Path $taskInstallDir 'Uninstall 阴阳师阵容图鉴.exe'
$taskInstallKey = "HKCU:\Software\$taskGuid"
$taskUninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$taskGuid"
$taskKeys = @($taskInstallKey, $taskUninstallKey, "HKLM:\Software\$taskGuid", "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$taskGuid")
$taskLinks = @((Join-Path ([Environment]::GetFolderPath('Desktop')) '阴阳师阵容图鉴.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) '阴阳师阵容图鉴.lnk'))
if (@($taskKeys + $taskLinks | Where-Object { Test-Path -LiteralPath $_ }).Count) { throw 'Existing installation or shortcut found; preserving it' }
if (Get-Process -Name '阴阳师阵容图鉴' -ErrorAction SilentlyContinue) { throw 'An existing application is running; preserving it' }
if (-not (Test-Path -LiteralPath $taskSetup)) { throw 'Setup artifact is missing' }

function Invoke-TaskProcess([string]$executable, [string[]]$arguments) {
    $taskProcess = Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $taskRoot -WindowStyle Hidden -Wait -PassThru
    if ($taskProcess.ExitCode -ne 0) { throw "Process returned $($taskProcess.ExitCode): $executable" }
}
function Assert-TaskInstallOwnership {
    $taskRegistered = (Get-ItemProperty -LiteralPath $taskInstallKey).InstallLocation
    if ([System.IO.Path]::GetFullPath($taskRegistered).TrimEnd('\') -ne $taskInstallDir) { throw 'Installer registration points outside the QA directory' }
    if (-not $taskInstallDir.StartsWith($taskRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe uninstall target' }
    if (Get-Process -Name '阴阳师阵容图鉴' -ErrorAction SilentlyContinue) { throw 'Application still running; refusing uninstall' }
}

$taskResult = [ordered]@{ version = $taskVersion; method = 'Actual silent install, installed app smoke, reinstall and uninstall'; personalAccountFilesRead = $false; installPathContainsChineseAndSpace = $true }
$taskMarkers = @()
$taskInstallStarted = $false
$taskFinished = $false
try {
    New-Item -ItemType Directory -Path $taskProfileDir -Force | Out-Null
    $taskFixture = Get-Content -LiteralPath (Join-Path $taskRoot 'verification\fixtures\mixed-backup-v030.json') -Raw -Encoding utf8 | ConvertFrom-Json
    $taskState = @{ schemaVersion = 1; accounts = $taskFixture.accounts; activeAccount = $taskFixture.accounts[0].id; lineups = @($taskFixture.lineups | Where-Object { $_.code -and $_.code.Trim() }) }
    $taskStatePath = Join-Path $taskProfileDir 'library-v1.json'
    # Match the app's UTF-8 JSON writer on both Windows PowerShell and PowerShell 7.
    [System.IO.File]::WriteAllText($taskStatePath, ($taskState | ConvertTo-Json -Depth 100), [System.Text.UTF8Encoding]::new($false))
    $taskStateHash = (Get-FileHash -LiteralPath $taskStatePath -Algorithm SHA256).Hash

    # Markers exercise the uninstaller's real default AppData targets without
    # opening library-v1.json or any other existing user file.
    $taskRoaming = [Environment]::GetFolderPath('ApplicationData')
    foreach ($taskName in @('阴阳师阵容图鉴', 'onmyoji-lineup-atlas')) {
        $taskMarkerDir = [System.IO.Path]::GetFullPath((Join-Path $taskRoaming $taskName))
        if (-not $taskMarkerDir.StartsWith($taskRoaming + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe data marker path' }
        $taskExisted = Test-Path -LiteralPath $taskMarkerDir
        New-Item -ItemType Directory -Path $taskMarkerDir -Force | Out-Null
        $taskMarker = Join-Path $taskMarkerDir ('.installer-qa-' + [guid]::NewGuid().ToString('N') + '.tmp')
        Set-Content -LiteralPath $taskMarker -Value 'Synthetic installer preservation check' -Encoding utf8
        $taskMarkers += @{ file = $taskMarker; directory = $taskMarkerDir; directoryExisted = $taskExisted; hash = (Get-FileHash -LiteralPath $taskMarker).Hash }
    }

    # NSIS requires unquoted /D= to be the final argument, including spaces.
    $taskInstallStarted = $true
    Invoke-TaskProcess $taskSetup @('/S', '/currentuser', "/D=$taskInstallDir")
    Assert-TaskInstallOwnership
    if (-not (Test-Path -LiteralPath $taskApp) -or -not (Test-Path -LiteralPath $taskUninstaller)) { throw 'Installed program or uninstaller is missing' }
    $taskResult.install = @{ exitCode = 0; registryVersion = (Get-ItemProperty -LiteralPath $taskUninstallKey).DisplayVersion; uninstallerPresent = $true }
    if ($taskResult.install.registryVersion -ne $taskVersion) { throw 'Installed registry version mismatch' }
    $taskShell = New-Object -ComObject WScript.Shell
    $taskResult.shortcuts = @($taskLinks | ForEach-Object { @{ exists = (Test-Path -LiteralPath $_); targetMatches = ($taskShell.CreateShortcut($_).TargetPath -eq $taskApp) } })
    if (@($taskResult.shortcuts | Where-Object { -not $_.exists -or -not $_.targetMatches }).Count) { throw 'Shortcut verification failed' }
    $taskResult.installedAsarMatches = (Get-FileHash -LiteralPath (Join-Path $taskInstallDir 'resources\app.asar')).Hash -eq (Get-FileHash -LiteralPath (Join-Path $taskRoot 'release\win-unpacked\resources\app.asar')).Hash
    if (-not $taskResult.installedAsarMatches) { throw 'Installed application differs from the build' }

    $taskHelper = Join-Path $taskInstallDir 'resources\ta-runtime\atlas-ta-helper.exe'
    if (-not (Test-Path -LiteralPath $taskHelper)) { throw 'Installed login module missing' }
    $taskResult.installedHelperMatches = (Get-FileHash -LiteralPath $taskHelper).Hash -eq (Get-FileHash -LiteralPath (Join-Path $taskRoot 'release\ta-runtime\atlas-ta-helper\atlas-ta-helper.exe')).Hash
    if (-not $taskResult.installedHelperMatches) { throw 'Installed login module hash mismatch' }
    $env:ATLAS_SMOKE_USER_DATA = $taskProfileDir
    $env:ATLAS_SMOKE_OUTPUT = Join-Path $taskRoot "verification\electron-v$($taskVersion.Replace('.',''))-installed-smoke.json"
    Invoke-TaskProcess $taskApp @('--smoke')
    $taskSmoke = Get-Content -LiteralPath $env:ATLAS_SMOKE_OUTPUT -Raw -Encoding utf8 | ConvertFrom-Json
    if ($taskSmoke.error -or -not $taskSmoke.gateVisible -or -not $taskSmoke.appHidden -or -not $taskSmoke.appInert -or $taskSmoke.dataLoaded -or $taskSmoke.blockedOperations.Count -ne 9 -or -not $taskSmoke.loginModule.qrReady) { throw 'Installed startup login gate smoke failed' }
    if (-not $taskSmoke.loginModule -or $taskSmoke.loginModule.servers -lt 100 -or -not $taskSmoke.loginModuleLoggedOut) { throw 'Installed login smoke failed' }
    $taskResult.installedLoginModule = $taskSmoke.loginModule
    $taskResult.installedAppSmoke = 'passed'
    $taskResult.accountAndLineupFileUnchanged = (Get-FileHash -LiteralPath $taskStatePath).Hash -eq $taskStateHash
    if (-not $taskResult.accountAndLineupFileUnchanged) { throw 'Synthetic account data changed' }

    Invoke-TaskProcess $taskSetup @('/S', '/currentuser', "/D=$taskInstallDir")
    Assert-TaskInstallOwnership
    $taskResult.reinstall = @{ exitCode = 0; applicationPresent = (Test-Path -LiteralPath $taskApp); dataPreserved = ((Get-FileHash -LiteralPath $taskStatePath).Hash -eq $taskStateHash) }
    if (-not $taskResult.reinstall.applicationPresent -or -not $taskResult.reinstall.dataPreserved) { throw 'Reinstall failed' }

    Invoke-TaskProcess $taskUninstaller @('/S', '/currentuser')
    $taskResult.uninstall = @{ exitCode = 0; applicationRemoved = -not (Test-Path -LiteralPath $taskApp); registrationRemoved = @($taskKeys | Where-Object { Test-Path -LiteralPath $_ }).Count -eq 0; shortcutsRemoved = @($taskLinks | Where-Object { Test-Path -LiteralPath $_ }).Count -eq 0; qaProfilePreserved = ((Get-FileHash -LiteralPath $taskStatePath).Hash -eq $taskStateHash); defaultAppDataMarkersPreserved = @($taskMarkers | Where-Object { -not (Test-Path -LiteralPath $_.file) -or (Get-FileHash -LiteralPath $_.file).Hash -ne $_.hash }).Count -eq 0 }
    if (@($taskResult.uninstall.Values | Where-Object { $_ -is [bool] -and -not $_ }).Count) { throw 'Uninstall or data preservation failed' }
    $taskFinished = $true
} finally {
    if ($taskInstallStarted -and -not $taskFinished -and (Test-Path -LiteralPath $taskUninstaller) -and (Test-Path -LiteralPath $taskInstallKey)) {
        Assert-TaskInstallOwnership
        Invoke-TaskProcess $taskUninstaller @('/S', '/currentuser')
    }
    foreach ($taskMarker in $taskMarkers) {
        # Delete only the individually created marker; remove a newly created
        # directory only if empty, never recursively.
        if (Test-Path -LiteralPath $taskMarker.file) { Remove-Item -LiteralPath $taskMarker.file }
        if (-not $taskMarker.directoryExisted -and (Test-Path -LiteralPath $taskMarker.directory)) { try { [System.IO.Directory]::Delete($taskMarker.directory, $false) } catch {} }
    }
    $taskResult.completed = $taskFinished
    $taskResult | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $taskRoot "verification\installer-v$($taskVersion.Replace('.','')).json") -Encoding utf8
}
$taskResult | ConvertTo-Json -Depth 10
