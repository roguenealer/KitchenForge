@echo off
set JAVA_HOME=C:\Users\rogue\Desktop\jdk17\jdk17
set ANDROID_SDK_ROOT=C:\Users\rogue\Desktop\android-sdk
set ANDROID_HOME=C:\Users\rogue\Desktop\android-sdk
cd /d C:\Users\rogue\Desktop\KitchenForge\android
call gradlew.bat assembleRelease
echo.
echo Build complete! Check app\build\outputs\apk\release\ for the APK
