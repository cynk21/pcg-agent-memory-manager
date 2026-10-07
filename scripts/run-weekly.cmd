@echo off
rem Wöchentlicher PCG-Agent-Lauf (Weekly Review, nur freitags wirksam) - Task Scheduler.
cd /d "%~dp0.."
set LOGDIR=%~dp0..\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
call npm run agent -- weekly >> "%LOGDIR%\weekly.log" 2>&1
