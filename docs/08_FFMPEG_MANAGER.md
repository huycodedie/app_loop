# FFmpeg Manager Documentation - Video Repeat Studio

## 1. Overview
The `FFmpegManager` module is responsible for centralized discovery, validation, caching, and execution management of FFmpeg (`ffmpeg.exe`) and FFprobe (`ffprobe.exe`) binaries across both development and packaged production environments.

## 2. Executable Resolution Order
When resolving binaries, `FFmpegManager` tests executables in the following strict priority order:

1. **USER_CONFIGURED**: Paths explicitly set by the user in Settings (`settings.ffmpegPath` and `settings.ffprobePath`).
2. **BUNDLED**: Executables located in application resources for packaged Electron releases (`process.resourcesPath/resources/ffmpeg/win32-x64/` or `process.resourcesPath/ffmpeg/win32-x64/`).
3. **DEVELOPMENT_RESOURCES**: Repository resources directory (`<workspace>/resources/ffmpeg/win32-x64/`).
4. **SYSTEM_PATH**: Executables available through the Windows system `PATH` environment variable.
5. **NOT_FOUND**: Explicit fallback state with `ffmpegAvailable: false` and `ffprobeAvailable: false`.

## 3. Validation Strategy
Before any binary path is accepted:
- `fs.existsSync(path)` & `fs.statSync(path).isFile()` check.
- `execFile(path, ['-version'], { timeout: 3000 })` execution.
- Pattern verification for `ffmpeg version` / `ffprobe version`.

## 4. Error Codes & User Messages
- **FFPROBE_MISSING**: "Không tìm thấy FFprobe. Hãy cài đặt FFmpeg hoặc chọn đúng thư mục chứa ffmpeg.exe và ffprobe.exe trong phần Cài đặt."
- **FFMPEG_MISSING**: "Không tìm thấy FFmpeg. Hãy cài đặt FFmpeg hoặc chọn đúng thư mục chứa ffmpeg.exe và ffprobe.exe trong phần Cài đặt."

## 5. Electron Builder Configuration
In `electron-builder.json`, extra resources copy the `resources` directory directly outside `app.asar`:
```json
"extraResources": [
  {
    "from": "resources",
    "to": "resources",
    "filter": ["**/*"]
  }
]
```
