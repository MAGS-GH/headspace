[CmdletBinding()]
param([switch]$UseExistingWebBuild)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$artifacts = Join-Path $repo 'artifacts'
# Each publish uses its own empty folder so removed web assets never enter a subsequent ZIP.
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("Aandehul-" + [guid]::NewGuid().ToString('N'))
$output = Join-Path $staging 'Aandehul'
$portable = Join-Path $staging 'light/Aandehul'
$downloads = Join-Path $repo 'public/downloads'
$downloadArchive = Join-Path $downloads 'Aandehul-Windows.zip'
$archive = Join-Path $artifacts 'Aandehul-Windows-x64.zip'

Push-Location $repo
try {
    if (!$UseExistingWebBuild) {
        npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Webafhængighederne kunne ikke installeres.' }
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Webappen kunne ikke bygges.' }
    }
    dotnet publish (Join-Path $PSScriptRoot 'Aandehul.csproj') -c Release -r win-x64 --self-contained true -p:DebugType=None -p:DebugSymbols=false -o $output
    if ($LASTEXITCODE -ne 0) { throw 'Windows-appen kunne ikke udgives.' }
    New-Item -ItemType Directory -Path $artifacts -Force | Out-Null
    Compress-Archive -LiteralPath $output -DestinationPath $archive -CompressionLevel Optimal -Force
    dotnet publish (Join-Path $PSScriptRoot 'Aandehul.csproj') -c Release -r win-x64 --self-contained false -p:DebugType=None -p:DebugSymbols=false -o $portable
    if ($LASTEXITCODE -ne 0) { throw 'Den lille Windows-pakke kunne ikke udgives.' }
    New-Item -ItemType Directory -Path $downloads -Force | Out-Null
    Compress-Archive -LiteralPath $portable -DestinationPath $downloadArchive -CompressionLevel Optimal -Force
    # Vite built before the ZIP was updated. Include this exact package in the current site as well.
    $builtDownloads = Join-Path $repo 'dist/downloads'
    New-Item -ItemType Directory -Path $builtDownloads -Force | Out-Null
    Copy-Item -LiteralPath $downloadArchive -Destination $builtDownloads -Force
    Write-Output $archive, $downloadArchive
} finally {
    Pop-Location
    $resolved = Resolve-Path $staging -ErrorAction SilentlyContinue
    $temp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolved -and $resolved.Path.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($resolved.Path) -match '^Aandehul-[0-9a-f]{32}$') {
        Remove-Item -LiteralPath $resolved.Path -Recurse -Force
    }
}
