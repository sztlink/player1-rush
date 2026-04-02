@echo off
cd /d "%~dp0"
echo.
echo  Servidor local: http://localhost:3000
echo  Abra esse endereco no navegador (Chrome/Edge/Firefox).
echo  Pressione Ctrl+C para encerrar.
echo.
python -m http.server 3000
