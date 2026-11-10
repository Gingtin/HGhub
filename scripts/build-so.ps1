$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Users\Gingtin\.jdks\temurin-21"
$env:ANDROID_HOME = "G:\Android\Sdk"
$env:NDK_HOME = "G:\Android\Sdk\ndk\28.2.13676358"
$env:GRADLE_USER_HOME = "G:\.gradle"

$ndkBin = "$env:NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:CC_aarch64_linux_android = "$ndkBin\aarch64-linux-android24-clang.cmd"
$env:CXX_aarch64_linux_android = "$ndkBin\aarch64-linux-android24-clang++.cmd"
$env:AR_aarch64_linux_android = "$ndkBin\llvm-ar.exe"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$ndkBin\aarch64-linux-android24-clang.cmd"
$env:PATH = "C:\Users\Gingtin\.cargo\bin;$ndkBin;$env:JAVA_HOME\bin;$env:PATH"

Set-Location -Path "G:\HGhub\src-tauri"
Write-Host "Building Rust native lib for aarch64-linux-android..."
cargo.exe build --package huangguo-client --target aarch64-linux-android --release
