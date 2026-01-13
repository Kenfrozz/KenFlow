@echo off
echo ============================================
echo    KenFlow Build Script
echo    Akilli Mesaj Otomasyonu
echo ============================================
echo.

:: Check if we're in the right directory
if not exist "package.json" (
    echo ERROR: package.json not found!
    echo Please run this script from the project root directory.
    pause
    exit /b 1
)

echo [1/4] Installing Node.js dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed!
    pause
    exit /b 1
)

echo.
echo [2/4] Installing Python dependencies...
pip install -r python/requirements.txt
pip install pyinstaller
if errorlevel 1 (
    echo ERROR: pip install failed!
    pause
    exit /b 1
)

echo.
echo [3/4] Building Python backend executable...
cd python
pyinstaller --clean --noconfirm kenflow-backend.spec
if errorlevel 1 (
    echo ERROR: PyInstaller failed!
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo [4/4] Building Electron application...
call npm run dist
if errorlevel 1 (
    echo ERROR: electron-builder failed!
    pause
    exit /b 1
)

echo.
echo ============================================
echo    BUILD COMPLETED SUCCESSFULLY!
echo ============================================
echo.
echo Output files are in the 'dist' folder:
dir /b dist\*.exe 2>nul
echo.
echo KenFlow is ready for distribution!
pause
