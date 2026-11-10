$env:JAVA_HOME = "C:\Users\Gingtin\.jdks\temurin-21"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$sdk = "G:\Android\Sdk"
$sdkmanager = "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"

Write-Host "Installing ndk;28.2.13676358..."
& $sdkmanager --sdk_root=$sdk "ndk;28.2.13676358"
