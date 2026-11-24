@echo off
chcp 65001 >nul
title История Светы - запуск
cd /d "%~dp0"

if not exist "tools\server_video.py" (
  echo.
  echo   Не нашёл файлы книги рядом с этим файлом.
  echo   Скорее всего, архив открыт, но не распакован.
  echo   Нажми на архив правой кнопкой мыши - "Извлечь все", потом запусти этот файл из распакованной папки.
  echo.
  pause
  exit /b
)

set PY=
where py >nul 2>nul && set PY=py -I
if not defined PY (
  where python >nul 2>nul && set PY=python -I
)
if not defined PY (
  echo.
  echo   Не найден Python. Установи его с python.org (галочка "Add to PATH"^) и запусти снова.
  echo.
  pause
  exit /b
)

rem сервер уже работает? тогда просто открываем книгу
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient('127.0.0.1',8790)).Close(); exit 0 } catch { exit 1 }"
if not errorlevel 1 goto open

start "История Светы - сервер (не закрывай это окно)" %PY% "tools\server_video.py" 8790

echo Запускаю книгу, подожди пару секунд...
set /a N=0
:wait
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient('127.0.0.1',8790)).Close(); exit 0 } catch { exit 1 }"
if not errorlevel 1 goto open
set /a N+=1
if %N% GEQ 30 (
  echo.
  echo   Сервер не запустился. Посмотри сообщение в окне "История Светы - сервер".
  echo.
  pause
  exit /b
)
timeout /t 1 /nobreak >nul
goto wait

:open
if defined KNIGA_TEST exit /b
start "" http://127.0.0.1:8790/index.html
