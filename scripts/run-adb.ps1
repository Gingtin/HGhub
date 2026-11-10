param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$AdbArgs
)

$adb = "C:\Users\Gingtin\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe"
& $adb connect 127.0.0.1:16384 | Out-Null
& $adb -s 127.0.0.1:16384 @AdbArgs
