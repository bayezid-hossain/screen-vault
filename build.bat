@echo off
setlocal

cd /d %~dp0

if "%~1"=="" goto help
if "%~1"=="--help" goto help
if "%~1"=="--preview" goto preview
if "%~1"=="--production" goto production

:help
echo Usage: build.bat [options]
echo Options:
echo   --preview     Build the preview APK (debug)
echo   --production  Build the production APK (release)
goto end

:preview
echo Starting Preview Build...
set NODE_ENV=production
call npx expo prebuild --platform android
call android\gradlew.bat -p android assembleDebug
if %ERRORLEVEL% neq 0 (
    echo Preview Build Failed!
    exit /b %ERRORLEVEL%
)
echo.
echo Preview Build Completed Successfully.
echo APK: android\app\build\outputs\apk\debug\app-debug.apk
goto end

:production
echo Starting Production Build...
set NODE_ENV=production
call npx expo prebuild --platform android
call android\gradlew.bat -p android assembleRelease
if %ERRORLEVEL% neq 0 (
    echo Production Build Failed!
    exit /b %ERRORLEVEL%
)
echo.
echo Production Build Completed Successfully.
echo APK: android\app\build\outputs\apk\release\app-release.apk
goto end

:end
endlocal
