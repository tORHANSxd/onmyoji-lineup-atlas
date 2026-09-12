$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskDist = [IO.Path]::GetFullPath((Join-Path $taskRoot 'release\ta-runtime'))
$taskWork = [IO.Path]::GetFullPath((Join-Path $taskRoot 'user-data\ta-build'))
# PyInstaller replaces its previous generated output with --noconfirm.
foreach ($taskOutput in @($taskDist, $taskWork)) {
    if (-not $taskOutput.StartsWith($taskRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Build output outside workspace' }
}
$taskPython = Join-Path $taskRoot 'user-data\ta-build-venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
    python -m venv (Join-Path $taskRoot 'user-data\ta-build-venv')
    if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed' }
}
& $taskPython -m pip install -r (Join-Path $taskRoot 'desktop\ta-python\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'TA runtime dependencies failed' }
& $taskPython -m PyInstaller --noconfirm --onedir --console --name atlas-ta-helper --distpath $taskDist --workpath $taskWork --specpath $taskWork --add-data ((Join-Path $taskRoot 'desktop\ta-python\login_protocol.json') + ';.') --add-data ((Join-Path $taskRoot 'desktop\ta-python\server_catalog.json') + ';.') (Join-Path $taskRoot 'desktop\ta-python\worker.py')
if ($LASTEXITCODE -ne 0) { throw 'TA runtime build failed' }
& $taskPython (Join-Path $taskRoot 'tools\ta-runtime-notices.py')
if ($LASTEXITCODE -ne 0) { throw 'TA runtime license collection failed' }
