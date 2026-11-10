$env:JAVA_HOME = "C:\Users\Gingtin\.jdks\temurin-21"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Write-Host "Checking Java..."
& java.exe -version

Write-Host "Checking sdkmanager..."
& "G:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" --sdk_root="G:\Android\Sdk" --version
