# HGhub Android 本地一键打包脚本
param(
    [ValidateSet("release", "debug", "all")]
    [string]$Mode = "release"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -Path $scriptDir

# 1. 环境变量配置
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    $fallbackJdks = @(
        "C:\Users\Gingtin\.jdks\temurin-21",
        "G:\Program Files\Android\Android Studio\jbr"
    )
    foreach ($jdk in $fallbackJdks) {
        if (Test-Path "$jdk\bin\java.exe") {
            $env:JAVA_HOME = $jdk
            break
        }
    }
}

if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = "C:\Users\Gingtin\AppData\Local\Android\Sdk"
}

if (-not $env:NDK_HOME) {
    $env:NDK_HOME = "C:\Users\Gingtin\AppData\Local\Android\Sdk\ndk\28.2.13676358"
}

$ndkBin = "$env:NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:CC_aarch64_linux_android = "$ndkBin\aarch64-linux-android24-clang.cmd"
$env:CXX_aarch64_linux_android = "$ndkBin\aarch64-linux-android24-clang++.cmd"
$env:AR_aarch64_linux_android = "$ndkBin\llvm-ar.exe"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$ndkBin\aarch64-linux-android24-clang.cmd"
$env:PATH = "$ndkBin;$env:JAVA_HOME\bin;$env:PATH"

Write-Host "=== HGhub Android 打包环境 ===" -ForegroundColor Cyan
Write-Host "JAVA_HOME:    $env:JAVA_HOME"
Write-Host "ANDROID_HOME: $env:ANDROID_HOME"
Write-Host "NDK_HOME:     $env:NDK_HOME"

# 2. 构建前端
Write-Host "`n[1/3] 构建前端资源..." -ForegroundColor Green
pnpm.cmd build
node scripts/sync-android-icons.mjs

# 3. 编译 Rust aarch64 native 动态库
Write-Host "`n[2/3] 编译 Rust aarch64 动态库..." -ForegroundColor Green
Set-Location -Path "$scriptDir\src-tauri"
cargo.exe build --package huangguo-client --target aarch64-linux-android --release

# 拷贝 .so 到 Android jniLibs
$jniDir = "$scriptDir\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Force -Path $jniDir | Out-Null
Copy-Item "$scriptDir\src-tauri\target\aarch64-linux-android\release\libhuangguo_client_lib.so" "$jniDir\libhuangguo_client_lib.so" -Force

# 4. 执行 Gradle 打包
Set-Location -Path "$scriptDir\src-tauri\gen\android"
New-Item -ItemType Directory -Force -Path "$scriptDir\build-apk" | Out-Null

if ($Mode -eq "release" -or $Mode -eq "all") {
    Write-Host "`n[3/3] 执行 Gradle assembleArm64Release..." -ForegroundColor Green
    .\gradlew.bat assembleArm64Release

    $unsigned = "$scriptDir\src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release-unsigned.apk"
    $signed = "$scriptDir\build-apk\HGhub-v1.2.1-arm64-release.apk"
    $apksigner = "$env:ANDROID_HOME\build-tools\36.0.0\apksigner.bat"
    $keystore = "C:\Users\Gingtin\.android\debug.keystore"

    if (Test-Path $unsigned -and Test-Path $apksigner -and Test-Path $keystore) {
        & $apksigner sign --ks "$keystore" --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android --out "$signed" "$unsigned"
        Write-Host "已生成并签名 Release APK: $signed" -ForegroundColor Yellow
    }
}

if ($Mode -eq "debug" -or $Mode -eq "all") {
    Write-Host "`n[3/3] 执行 Gradle assembleArm64Debug..." -ForegroundColor Green
    .\gradlew.bat assembleArm64Debug
    $debugApk = "$scriptDir\src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk"
    $outDebug = "$scriptDir\build-apk\HGhub-v1.2.1-arm64-debug.apk"
    Copy-Item $debugApk $outDebug -Force
    Write-Host "已生成 Debug APK: $outDebug" -ForegroundColor Yellow
}

Write-Host "`n=== 打包完成！生成文件目录: $scriptDir\build-apk ===" -ForegroundColor Green
Get-ChildItem "$scriptDir\build-apk" | Format-Table Name, Length, LastWriteTime
