@echo off
rem Wöchentlicher PCG-Agent-Lauf (Weekly Review, nur freitags wirksam) - Task Scheduler.
setlocal
cd /d "%~dp0.."

rem Stelle sicher, dass Node/npm und Standardpfade im PATH sind
set "PATH=%LOCALAPPDATA%\hermes\node;%ProgramFiles%\nodejs;%PATH%"

set "LOGDIR=%~dp0..\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo [%date% %time%] Starte PCG Agent Weekly >> "%LOGDIR%\weekly.log"
call npm.cmd run agent -- weekly >> "%LOGDIR%\weekly.log" 2>&1
echo [%date% %time%] Beendet mit Exit Code %ERRORLEVEL% >> "%LOGDIR%\weekly.log"
endlocal
