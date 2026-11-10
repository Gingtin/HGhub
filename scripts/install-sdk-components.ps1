$env:JAVA_HOME = "C:\Users\Gingtin\.jdks\temurin-21"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$sdk = "G:\Android\Sdk"
$sdkmanager = "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"

Write-Host "Accepting licenses..."
"y`ny`ny`ny`ny`ny`ny" | & $sdkmanager --sdk_root=$sdk --licenses | Out-Null

Write-Host "Installing platform-tools, platforms;android-34, build-tools;34.0.0..."
& $sdkmanager --sdk_root=$sdk "platform-tools" "platforms;android-34" "build-tools;34.0.0"
