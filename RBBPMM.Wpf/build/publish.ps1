<#
.SYNOPSIS
    打一个自包含的 Windows 发布包。

.DESCRIPTION
    与 Electron 版对齐：产物是「解压即用、不依赖机器上装没装运行时」的目录，再压成 zip。

    - 自包含（--self-contained）而不是框架依赖：目标用户装了游戏不一定会去装 .NET 10 桌面运行时。
    - 不裁剪（PublishTrimmed=false）：WPF 大量依赖反射，裁剪会在运行时才炸。
    - 只发 win-x64：本项目仅 Windows（见项目约定）。

    本文件必须保存为「UTF-8 带 BOM」！Windows PowerShell 5.1 对无 BOM 的文件会按
    系统 ANSI 代码页解码，中文注释会被拆坏，进而把引号/括号吃成语法错误 —— 症状是
    脚本一句输出都没有就直接退出。PackagingTests 里有守卫。

.OUTPUTS
    dist/RBBPMM-<version>-win-x64.zip
#>
[CmdletBinding()]
param(
    [string]$Configuration = 'Release',
    [string]$Runtime = 'win-x64'
)

$ErrorActionPreference = 'Stop'

# dotnet 的输出按控制台代码页（简体中文机器上是 936）编码，不显式改成 UTF-8 的话，
# 重定向进日志文件后中文全是乱码，真出问题时反而看不懂日志。
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

# 用 Write-Output 而不是 Write-Host：Write-Host 在 PS 5.1 里写的是宿主，无法被
# 重定向或 Out-File 捕获，出问题时连日志都留不下来。
function Say([string]$Message) { Write-Output $Message }

# 脚本所在目录即 build/，上一级是 RBBPMM.Wpf/
if (-not $PSScriptRoot) { throw '无法确定脚本目录（$PSScriptRoot 为空）' }
$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'RBBPMM/RBBPMM.csproj'
$dist = Join-Path $root 'dist'
$stage = Join-Path $dist 'publish'

if (-not (Test-Path $project)) { throw "找不到工程文件: $project" }
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw '找不到 dotnet CLI，请确认已安装 .NET 10 SDK' }

# 版本号以 csproj 为准（和 Electron 版的 package.json 对齐），避免两处各写一份
$version = ([regex]'<Version>([^<]+)</Version>').Match(
    (Get-Content $project -Raw)).Groups[1].Value
if (-not $version) { throw 'RBBPMM.csproj 里读不到 <Version>' }

$zip = Join-Path $dist "RBBPMM-$version-$Runtime.zip"

Say "==> 清理 $dist"
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Path $dist -Force | Out-Null

Say "==> 发布 $version ($Runtime, 自包含)"
& dotnet publish $project `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishTrimmed=false `
    -p:DebugType=none `
    -o $stage
if ($LASTEXITCODE -ne 0) { throw "dotnet publish 失败（退出码 $LASTEXITCODE）" }

# 运行时依赖与语言包缺失只会在用户机器上暴露，所以在这里就拦住
Say '==> 核对产物清单'
$required = @('RBBPMM.exe', '7z/7z.exe', '7z/7z.dll', 'BepInEx.zip')
foreach ($lang in @('en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es',
                    'pt', 'fr', 'de', 'ru', 'ydyy', 'fish')) {
    $required += "Resources/$lang.json"
}

$sep = [IO.Path]::DirectorySeparatorChar
$missing = @()
foreach ($rel in $required) {
    $path = Join-Path $stage ($rel -replace '/', $sep)
    if (-not (Test-Path $path)) { $missing += $rel }
}
if ($missing.Count -gt 0) { throw "发布产物缺文件: $($missing -join ', ')" }

Say "==> 打包 $([IO.Path]::GetFileName($zip))"
# 用 .NET 的 ZipFile 而不是 Compress-Archive：自包含发布有上千个文件，
# Compress-Archive 在这个量级慢得离谱。includeBaseDirectory=false 让解压出来是平的，
# 与 Electron 版 0.1.4 的发布包一致。
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory(
    $stage, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
$count = (Get-ChildItem $stage -Recurse -File).Count
Say ''
Say "完成: $zip"
Say "      $count 个文件, 压缩后 $size MB"
