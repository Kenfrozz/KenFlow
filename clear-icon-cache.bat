@echo off
echo Windows Icon Cache Temizleniyor...
echo.

taskkill /F /IM explorer.exe

timeout /t 2 /nobreak > nul

cd /d %userprofile%\AppData\Local
del IconCache.db /a

cd /d %userprofile%\AppData\Local\Microsoft\Windows\Explorer
del iconcache*.db /a /q

echo Icon cache temizlendi!
echo Explorer yeniden baslatiliyor...

start explorer.exe

echo.
echo Tamamlandi! Simdi yeni Setup.exe dosyasini yukleyin.
pause
