$ErrorActionPreference = "Stop"

$scriptDir = "G:\HGhub"
$adb = "C:\Users\Gingtin\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe"

$env:JAVA_HOME = "C:\Users\Gingtin\.jdks\temurin-21"
$env:ANDROID_HOME = "G:\Android\Sdk"
$env:NDK_HOME = "G:\Android\Sdk\ndk\28.2.13676358"
$env:GRADLE_USER_HOME = "G:\.gradle"
$env:PATH = "C:\Users\Gingtin\.cargo\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:JAVA_HOME\bin;$env:PATH"

# 1. 复制最新生成的 libhuangguo_client_lib.so 到 jniLibs
$soSrc = "$scriptDir\src-tauri\target\aarch64-linux-android\release\libhuangguo_client_lib.so"
$jniDest = "$scriptDir\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
New-Item -ItemType Directory -Force -Path $jniDest | Out-Null
Copy-Item $soSrc "$jniDest\libhuangguo_client_lib.so" -Force
Write-Host "已同步 native lib 到 jniLibs:" -ForegroundColor Green
Get-Item "$jniDest\libhuangguo_client_lib.so" | Select-Object Length, LastWriteTime

# 2. 跑 Gradle 打包 Debug APK
Write-Host "`n执行 Gradle assembleArm64Debug..." -ForegroundColor Green
Set-Location -Path "$scriptDir\src-tauri\gen\android"
.\gradlew.bat assembleArm64Debug --no-daemon

$debugApk = "$scriptDir\src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk"
New-Item -ItemType Directory -Force -Path "$scriptDir\build-apk" | Out-Null
Copy-Item $debugApk "$scriptDir\build-apk\HGhub-v1.2.1-arm64-debug.apk" -Force
Write-Host "打包成功！产物已复制到: $scriptDir\build-apk\HGhub-v1.2.1-arm64-debug.apk" -ForegroundColor Green

# 3. 安装到模拟器
Write-Host "`n连接模拟器并安装..." -ForegroundColor Green
& $adb connect 127.0.0.1:16384 | Out-Null
& $adb -s 127.0.0.1:16384 install -r "$debugApk"

# 4. 重启应用
Write-Host "`n重启黄果短剧并捕获截图..." -ForegroundColor Green
& $adb -s 127.0.0.1:16384 shell am force-stop com.hghub.huangguo
Start-Sleep -Seconds 1
& $adb -s 127.0.0.1:16384 shell monkey -p com.hghub.huangguo -c android.intent.category.LAUNCHER 1
Start-Sleep -Seconds 4

cmd.exe /c "$adb -s 127.0.0.1:16384 exec-out screencap -p > G:\HGhub\screen_upgraded.png"
Write-Host "新界面截图已保存至: G:\HGhub\screen_upgraded.png" -ForegroundColor Green
Get-Item "G:\HGhub\screen_upgraded.png" | Select-Object Length, LastWriteTime
