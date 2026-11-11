$ErrorActionPreference = "Stop"

$scriptDir = "G:\HGhub"
$adb = "C:\Users\Gingtin\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe"

$env:JAVA_HOME = "C:\Users\Gingtin\.jdks\temurin-21"
$env:ANDROID_HOME = "G:\Android\Sdk"
$env:NDK_HOME = "G:\Android\Sdk\ndk\28.2.13676358"
$env:GRADLE_USER_HOME = "G:\.gradle"
$env:PATH = "C:\Users\Gingtin\.cargo\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:JAVA_HOME\bin;$env:PATH"

# 1. 复制最新编译的 libhuangguo_client_lib.so 到 jniLibs/arm64-v8a
$soSrc = "$scriptDir\src-tauri\target\aarch64-linux-android\release\libhuangguo_client_lib.so"
$jniDest = "$scriptDir\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Force -Path $jniDest | Out-Null
Copy-Item $soSrc "$jniDest\libhuangguo_client_lib.so" -Force
Write-Host "已同步 native lib 到 jniLibs (arm64-v8a):" -ForegroundColor Green
Get-Item "$jniDest\libhuangguo_client_lib.so" | Select-Object Length, LastWriteTime

# 2. 执行 Gradle 构建 Release 和 Debug APK
Set-Location -Path "$scriptDir\src-tauri\gen\android"

Write-Host "`n[1/2] 正在构建 Release APK (assembleArm64Release)..." -ForegroundColor Cyan
.\gradlew.bat assembleArm64Release --no-daemon

Write-Host "`n[2/2] 正在构建 Debug APK (assembleArm64Debug)..." -ForegroundColor Cyan
.\gradlew.bat assembleArm64Debug --no-daemon

$outDir = "$scriptDir\build-apk"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$pkgVersion = (Get-Content "$scriptDir\package.json" -Raw | ConvertFrom-Json).version

$relApk = "$scriptDir\src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release.apk"
$dbgApk = "$scriptDir\src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk"

if (Test-Path $relApk) {
    Copy-Item $relApk "$outDir\HGhub-v$pkgVersion-arm64-release.apk" -Force
    Write-Host "`nRelease APK 打包完成: $outDir\HGhub-v$pkgVersion-arm64-release.apk" -ForegroundColor Green
}
if (Test-Path $dbgApk) {
    Copy-Item $dbgApk "$outDir\HGhub-v$pkgVersion-arm64-debug.apk" -Force
    Write-Host "Debug APK 打包完成: $outDir\HGhub-v$pkgVersion-arm64-debug.apk" -ForegroundColor Green
}

# 3. 校验产物
Get-ChildItem -Path $outDir -Filter "*.apk" | Select-Object Name, Length, LastWriteTime
