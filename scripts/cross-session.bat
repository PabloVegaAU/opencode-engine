@echo off
rem Cross-session CLI launcher - translates Unix-style --flag value to PowerShell -Flag value
rem Usage: cross-session.bat --subcommand mission-run --mission myid --approve-local-integration
rem    or: cross-session.bat -Subcommand mission-run -Mission myid -ApproveLocalIntegration

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "WRAPPER=%SCRIPT_DIR%cross-session.ps1"

rem Build PowerShell argument line using an array approach
rem We accumulate args in PS_ARGS, reading %1 %2 %3 etc dynamically
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
    rem No dash - positional argument
    set "PS_ARGS=!PS_ARGS! %~1"
    shift
    goto :get_next
)

rem Normalize: strip leading dashes (- or -- or ---) -> one dash
set "NORMALIZED=%~1"
set "NORMALIZED=!NORMALIZED:~1!"
if "!NORMALIZED:~0,1!"=="-" set "NORMALIZED=!NORMALIZED:~1!"

rem Map Unix-style flag names to PowerShell PascalCase names
if /i "!NORMALIZED!"=="mission" (
    set "PS_ARGS=!PS_ARGS! -Mission %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="subcommand" (
    set "PS_ARGS=!PS_ARGS! -Subcommand %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="project-root" (
    set "PS_ARGS=!PS_ARGS! -ProjectRoot %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="operation-id" (
    set "PS_ARGS=!PS_ARGS! -OperationId %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="ai-env-home" (
    set "PS_ARGS=!PS_ARGS! -AiEnvHome %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="environment-manifest" (
    set "PS_ARGS=!PS_ARGS! -EnvironmentManifest %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="project-manifest" (
    set "PS_ARGS=!PS_ARGS! -ProjectManifest %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="spec" (
    set "PS_ARGS=!PS_ARGS! -Spec %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="at" (
    set "PS_ARGS=!PS_ARGS! -At %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="task-key" (
    set "PS_ARGS=!PS_ARGS! -TaskKey %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="target-repository-id" (
    set "PS_ARGS=!PS_ARGS! -TargetRepositoryId %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="target-ref" (
    set "PS_ARGS=!PS_ARGS! -TargetRef %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="expected-target-commit" (
    set "PS_ARGS=!PS_ARGS! -ExpectedTargetCommit %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="approve-local-integration" (
    set "PS_ARGS=!PS_ARGS! -ApproveLocalIntegration"
) else if /i "!NORMALIZED!"=="max-iterations" (
    set "PS_ARGS=!PS_ARGS! -MaxIterations %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="poll-interval" (
    set "PS_ARGS=!PS_ARGS! -PollInterval %2"
    set "SKIP_NEXT=1"
) else if /i "!NORMALIZED!"=="timeout" (
    set "PS_ARGS=!PS_ARGS! -Timeout %2"
    set "SKIP_NEXT=1"
) else (
    rem Unrecognized - pass through as-is (subcommand like "mission-run" or unknown flag)
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
