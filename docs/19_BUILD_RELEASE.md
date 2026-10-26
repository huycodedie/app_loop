# Phase 19: Build and Release

## Status
PENDING

## Objective
Configure packaging scripts, installer generation (NSIS installer and portable executable for Windows x64), code signing settings, and release assets.

## Scope
- Electron Builder production packaging configuration (`electron-builder.json`).
- Binary asset embedding (FFmpeg / FFprobe executables bundled in app distribution).
- NSIS installer customization (custom destination directory, start menu shortcuts, uninstaller).

## Required Files
- `electron-builder.json`
- `package.json`

## Implementation Decisions
- Native binaries unpacked via `extraResources` or `asarUnpack` to enable execution.
- Release target: Windows x64 NSIS installer (`.exe`) and Portable standalone executable.

## Validation
- `npm run build` compiles Vite bundles cleanly.
- `npm run package` outputs valid `.exe` installer in `dist/` directory.
- Installed application launches and executes full video processing workflow without missing module errors.

## Completion Criteria
- Production Windows executable successfully built and validated.
