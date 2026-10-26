# Video Player & Preview Documentation - Video Repeat Studio

## 1. Overview
The HTML5 Video Player component (`VideoPlayer.tsx`) provides frame-accurate preview playback, timeline scrubbing, volume controls, and visual markers for Intro End timestamps.

## 2. Secure Custom Protocol Strategy
To prevent Chromium CORS and local file system URL errors on Windows (`contextIsolation: true`), media preview URLs are served through a custom privileged protocol:

```ts
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'video-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);
```

- **Renderer URL Generation**: `window.api.getPreviewUrl(filePath)` produces `video-media://${encodeURIComponent(filePath)}`.
- **Main Protocol Handler**:
```ts
protocol.handle('video-media', (request) => {
  const rawPath = request.url.substring('video-media://'.length);
  const decodedPath = decodeURIComponent(rawPath);
  return net.fetch(pathToFileURL(decodedPath).href);
});
```

This strategy natively supports Windows paths containing spaces, Vietnamese characters, Unicode, `#`, `%`, and parentheses.

## 3. Preview Error Fallback
If Chromium HTML5 video player encounters a codec it cannot natively decode:
- Component catches `onError` on `<video>` element.
- Shows localized warning: *"Không thể phát bản xem trước bằng trình phát tích hợp (codec không hỗ trợ). Video vẫn có thể được xử lý bình thường bằng FFmpeg."*
- `processingStatus` and `Start Processing` actions remain 100% enabled for FFmpeg rendering.
