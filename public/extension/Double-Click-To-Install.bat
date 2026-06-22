@echo off
title SupportHub Extension Installer
color 0a

echo ===================================================================
echo             SupportHub Extension Installation Helper
echo ===================================================================
echo.
echo Setting up permanent extension directory...
set "TARGET_DIR=%USERPROFILE%\SupportHub-Extension"

if not exist "%TARGET_DIR%" (
    mkdir "%TARGET_DIR%"
)

echo Copying extension files...
xcopy /s /y /i "%~dp0*" "%TARGET_DIR%" >nul

echo.
echo ===================================================================
echo                         ACTION REQUIRED
echo ===================================================================
echo  1. Turn ON "Developer mode" switch (top-right of Chrome settings).
echo  2. Drag the folder "%USERPROFILE%\SupportHub-Extension"
echo     and drop it onto the Chrome Extensions window.
echo ===================================================================
echo.
echo Launching Google Chrome Extensions page...
start chrome "chrome://extensions/"

echo Opening extension folder in File Explorer...
explorer "%TARGET_DIR%"
echo ===================================================================
echo IMPORTANT: The extension is now installed but may need to be "reloaded" 
echo after a restart or if it stops working.
echo
echo How to reload if needed:
echo 1. Open Chrome and go to "chrome://extensions"
echo 2. Find the "SupportHub" extension
echo 3. Turn the switch OFF and then ON again
echo
echo You can also use this command to reload it instantly:

echo.
echo Done! You can now close this window.
pause >nul
