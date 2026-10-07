@echo off
rem Täglicher PCG-Agent-Lauf (Daily-Briefing) - wird vom Windows Task Scheduler aufgerufen.
cd /d "%~dp0.."
set LOGDIR=%~dp0..\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
call npm run agent -- daily >> "%LOGDIR%\daily.log" 2>&1
