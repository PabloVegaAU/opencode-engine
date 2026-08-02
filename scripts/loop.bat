@echo off
rem Loop CLI launcher - Unix-style --flag value for loop command
rem Usage: loop.bat --max-iterations 10 -- "Implement feature X"

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "WRAPPER=%SCRIPT_DIR%loop.ps1"

set "PS_ARGS="
set "SKIP_NEXT="

:get_next
if "%~1"=="" goto :done_args

if defined SKIP_NEXT (
    set "PS_ARGS=!PS_ARGS! %~1"
    set "SKIP_NEXT="
    shift
    goto :get_next
)

rem Check if arg starts with dash
echo %~1 | findstr /r "^-" >nul
if errorlevel 1 (
    rem No dash - positional argument (like the prompt after --)
    set "PS_ARGS=!PS_ARGS! %~1"
    shift
    goto :get_next
)

rem Normalize: strip leading dashes (- or --) -> one dash
set "NORMALIZED=%~1"
set "NORMALIZED=!NORMALIZED:~1!"
if "!NORMALIZED:~0,1!"=="-" set "NORMALIZED=!NORMALIZED:~1!"

rem Map flag names to PowerShell PascalCase names
if /i "!NORMALIZED!"=="mission" (
    set "PS_ARGS=!PS_ARGS! -Mission %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="max-iterations" (
    set "PS_ARGS=!PS_ARGS! -MaxIterations %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="min-iterations" (
    set "PS_ARGS=!PS_ARGS! -MinIterations %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="timeout" (
    set "PS_ARGS=!PS_ARGS! -Timeout %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="checkpoint-every" (
    set "PS_ARGS=!PS_ARGS! -CheckpointEvery %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="approve-loop" (
    set "PS_ARGS=!PS_ARGS! -ApproveLoop"
) else if /i "!NORMALIZED!"=="agent" (
    set "PS_ARGS=!PS_ARGS! -Agent %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="model" (
    set "PS_ARGS=!PS_ARGS! -Model %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="project-root" (
    set "PS_ARGS=!PS_ARGS! -ProjectRoot %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="prompt" (
    rem Special handling for prompt after --
    set "PS_ARGS=!PS_ARGS! -Prompt %2"
    set "SKIP_NEXT=1"
) else (
    rem Pass through as-is
    set "PS_ARGS=!PS_ARGS! !NORMALIZED!"
)
shift
goto :get_next

:done_args
rem Remove leading space
set "PS_ARGS=!PS_ARGS:~1!"

rem Debug: echo Running: powershell -NoProfile -ExecutionPolicy Bypass -File "%WRAPPER%" !PS_ARGS!
powershell -NoProfile -ExecutionPolicy Bypass -File "%WRAPPER%" !PS_ARGS!
exit /b %ERRORLEVEL%
