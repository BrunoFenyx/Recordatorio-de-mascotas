@echo off
setlocal
cd /d "%~dp0"

echo.
echo  Recuerdos de mascotas
echo  Servidor local en http://localhost:8000
echo  Cierra esta ventana para detener el sitio.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000/'"

where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server 8000
) else (
  python -m http.server 8000
)

endlocal
