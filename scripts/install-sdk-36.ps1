$env:JAVA_HOME = "C:\Users\Gingtin\.jdks\temurin-21"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$sdk = "G:\Android\Sdk"
$sdkmanager = "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"

Write-Host "Installing platforms;android-36 and build-tools;36.0.0..."
& $sdkmanager --sdk_root=$sdk "platforms;android-36" "build-tools;36.0.0"
