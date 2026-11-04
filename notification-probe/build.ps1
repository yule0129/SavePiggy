param(
    [string]$SdkRoot = 'F:\Android_SDK',
    [string]$JavaRoot = 'F:\Android\jbr'
)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$buildRoot = Join-Path $projectRoot 'build'
$toolsRoot = Join-Path $SdkRoot 'build-tools\36.0.0'
$androidJar = Join-Path $SdkRoot 'platforms\android-37.0\android.jar'
$env:JAVA_HOME = $JavaRoot
$classes = Join-Path $buildRoot 'classes'
$dex = Join-Path $buildRoot 'dex'
New-Item -ItemType Directory -Path $classes, $dex -Force | Out-Null
$sources = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src') -Recurse -Filter '*.java' | ForEach-Object { $_.FullName })
& (Join-Path $JavaRoot 'bin\javac.exe') -encoding UTF-8 -source 8 -target 8 -classpath $androidJar -d $classes @sources
if ($LASTEXITCODE -ne 0) { throw 'Java compilation failed' }
$classFiles = @(Get-ChildItem -LiteralPath $classes -Recurse -Filter '*.class' | ForEach-Object { $_.FullName })
& (Join-Path $toolsRoot 'd8.bat') --min-api 28 --lib $androidJar --output $dex @classFiles
if ($LASTEXITCODE -ne 0) { throw 'DEX compilation failed' }
$unsigned = Join-Path $buildRoot 'unsigned.apk'
& (Join-Path $toolsRoot 'aapt2.exe') link -I $androidJar --manifest (Join-Path $projectRoot 'AndroidManifest.xml') -o $unsigned
if ($LASTEXITCODE -ne 0) { throw 'APK packaging failed' }
& (Join-Path $JavaRoot 'bin\jar.exe') uf $unsigned -C $dex classes.dex
if ($LASTEXITCODE -ne 0) { throw 'DEX packaging failed' }
$aligned = Join-Path $buildRoot 'aligned.apk'
& (Join-Path $toolsRoot 'zipalign.exe') -f 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed' }
$keystore = Join-Path $buildRoot 'debug.keystore'
if (-not (Test-Path -LiteralPath $keystore)) {
    & (Join-Path $JavaRoot 'bin\keytool.exe') -genkeypair -keystore $keystore -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 3650 -dname 'CN=SavePiggy Local Debug'
    if ($LASTEXITCODE -ne 0) { throw 'Debug signing key creation failed' }
}
$apk = Join-Path $buildRoot 'SavePiggy-notification-probe.apk'
& (Join-Path $toolsRoot 'apksigner.bat') sign --ks $keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --out $apk $aligned
if ($LASTEXITCODE -ne 0) { throw 'APK signing failed' }
& (Join-Path $toolsRoot 'apksigner.bat') verify $apk
if ($LASTEXITCODE -ne 0) { throw 'APK verification failed' }
Write-Output "APK_READY: $apk"
