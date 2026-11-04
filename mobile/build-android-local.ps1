param([string]$JavaRoot = '', [string]$SdkRoot = 'F:\Android_SDK')
$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path $PSScriptRoot -Parent
if (-not $JavaRoot) {
  $toolchainRoot = Join-Path $workspaceRoot '.toolchains\jdk17'
  $candidate = Get-ChildItem -LiteralPath $toolchainRoot -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
  if (-not $candidate) { throw 'Java 17 not found. Pass -JavaRoot with a portable JDK 17 folder.' }
  $JavaRoot = $candidate.FullName
}
if (-not (Test-Path -LiteralPath (Join-Path $JavaRoot 'bin\java.exe'))) { throw 'Invalid JavaRoot' }
$env:JAVA_HOME = $JavaRoot
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:GRADLE_USER_HOME = Join-Path $workspaceRoot '.gradle-cache'
$env:ANDROID_USER_HOME = Join-Path $workspaceRoot '.android-cache'
Push-Location $PSScriptRoot
try {
  & npx expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw 'Expo prebuild failed' }
  Push-Location (Join-Path $PSScriptRoot 'android')
  try {
    # Quote Gradle properties: Windows PowerShell can split unquoted dotted arguments.
    & .\gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a' '-Pandroid.enableMinifyInReleaseBuilds=false' '-Pandroid.enableShrinkResourcesInReleaseBuilds=false' --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }
  } finally { Pop-Location }
} finally { Pop-Location }
Write-Output (Join-Path $PSScriptRoot 'android\app\build\outputs\apk\release\app-release.apk')
