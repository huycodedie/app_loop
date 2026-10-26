import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { ExecutableResolution, ExecutableSource } from '@shared/types';
import { AppError } from '@shared/errors';
import { SettingsRepository } from '../repositories/SettingsRepository';

export class FFmpegManager {
  private cachedResolution: ExecutableResolution | null = null;

  constructor(private settingsRepo?: SettingsRepository) {}

  public invalidateCache(): void {
    this.cachedResolution = null;
  }

  public async resolve(forceRefresh = false): Promise<ExecutableResolution> {
    if (this.cachedResolution && !forceRefresh) {
      return this.cachedResolution;
    }

    const isWin = process.platform === 'win32';
    const exeExt = isWin ? '.exe' : '';
    const ffmpegName = `ffmpeg${exeExt}`;
    const ffprobeName = `ffprobe${exeExt}`;

    // 1. Check USER_CONFIGURED settings first
    if (this.settingsRepo) {
      try {
        const settings = this.settingsRepo.getSettings();
        if (settings.ffmpegPath && settings.ffprobePath) {
          const ffmpegVal = await this.validateExecutable(settings.ffmpegPath, /ffmpeg version/i);
          const ffprobeVal = await this.validateExecutable(settings.ffprobePath, /ffprobe version/i);

          if (ffmpegVal.valid && ffprobeVal.valid) {
            const resolution: ExecutableResolution = {
              ffmpegPath: settings.ffmpegPath,
              ffprobePath: settings.ffprobePath,
              source: 'USER_CONFIGURED',
              ffmpegAvailable: true,
              ffprobeAvailable: true,
              ffmpegVersion: ffmpegVal.version,
              ffprobeVersion: ffprobeVal.version,
              resolvedFolder: path.dirname(settings.ffmpegPath),
            };
            this.logResolution(resolution);
            this.cachedResolution = resolution;
            return resolution;
          }
        }
      } catch {
        // Safe fallback to auto-detection
      }
    }

    // 2. Check BUNDLED resources (Production packaged application)
    if (app && app.isPackaged && process.resourcesPath) {
      const bundledCandidates = [
        path.join(process.resourcesPath, 'resources', 'ffmpeg', 'win32-x64'),
        path.join(process.resourcesPath, 'ffmpeg', 'win32-x64'),
        path.join(process.resourcesPath, 'resources', 'ffmpeg'),
        path.join(process.resourcesPath, 'ffmpeg'),
        process.resourcesPath,
      ];

      for (const dir of bundledCandidates) {
        const ffmpegP = path.join(dir, ffmpegName);
        const ffprobeP = path.join(dir, ffprobeName);

        const ffmpegVal = await this.validateExecutable(ffmpegP, /ffmpeg version/i);
        const ffprobeVal = await this.validateExecutable(ffprobeP, /ffprobe version/i);

        if (ffmpegVal.valid && ffprobeVal.valid) {
          const resolution: ExecutableResolution = {
            ffmpegPath: ffmpegP,
            ffprobePath: ffprobeP,
            source: 'BUNDLED',
            ffmpegAvailable: true,
            ffprobeAvailable: true,
            ffmpegVersion: ffmpegVal.version,
            ffprobeVersion: ffprobeVal.version,
            resolvedFolder: dir,
          };
          this.logResolution(resolution);
          this.cachedResolution = resolution;
          return resolution;
        }
      }
    }

    // 3. Check DEVELOPMENT_RESOURCES (Current workspace resources directory)
    const rootDir = app ? app.getAppPath() : process.cwd();
    const devCandidates = [
      path.join(rootDir, 'resources', 'ffmpeg', 'win32-x64'),
      path.join(rootDir, 'resources', 'ffmpeg'),
      path.join(process.cwd(), 'resources', 'ffmpeg', 'win32-x64'),
      path.join(process.cwd(), 'resources', 'ffmpeg'),
    ];

    for (const dir of devCandidates) {
      const ffmpegP = path.join(dir, ffmpegName);
      const ffprobeP = path.join(dir, ffprobeName);

      const ffmpegVal = await this.validateExecutable(ffmpegP, /ffmpeg version/i);
      const ffprobeVal = await this.validateExecutable(ffprobeP, /ffprobe version/i);

      if (ffmpegVal.valid && ffprobeVal.valid) {
        const resolution: ExecutableResolution = {
          ffmpegPath: ffmpegP,
          ffprobePath: ffprobeP,
          source: 'DEVELOPMENT_RESOURCES',
          ffmpegAvailable: true,
          ffprobeAvailable: true,
          ffmpegVersion: ffmpegVal.version,
          ffprobeVersion: ffprobeVal.version,
          resolvedFolder: dir,
        };
        this.logResolution(resolution);
        this.cachedResolution = resolution;
        return resolution;
      }
    }

    // 4. Check SYSTEM_PATH environment variable
    const systemPathDirs = (process.env.PATH || '').split(path.delimiter);
    let systemFFmpeg: { filePath: string; version?: string } | null = null;
    let systemFFprobe: { filePath: string; version?: string } | null = null;
    for (const dir of systemPathDirs) {
      if (!dir || !fs.existsSync(dir)) continue;

      const ffmpegP = path.join(dir, ffmpegName);
      const ffprobeP = path.join(dir, ffprobeName);

      const ffmpegVal = await this.validateExecutable(ffmpegP, /ffmpeg version/i);
      const ffprobeVal = await this.validateExecutable(ffprobeP, /ffprobe version/i);

      if (ffmpegVal.valid && !systemFFmpeg) systemFFmpeg = { filePath: ffmpegP, version: ffmpegVal.version };
      if (ffprobeVal.valid && !systemFFprobe) systemFFprobe = { filePath: ffprobeP, version: ffprobeVal.version };

      // FFmpeg and FFprobe may live in separate PATH entries. A partial match
      // must not hide a working executable farther down PATH.
      if (systemFFmpeg && systemFFprobe) {
        const resolution: ExecutableResolution = {
          ffmpegPath: systemFFmpeg.filePath,
          ffprobePath: systemFFprobe.filePath,
          source: 'SYSTEM_PATH',
          ffmpegAvailable: true,
          ffprobeAvailable: true,
          ffmpegVersion: systemFFmpeg.version,
          ffprobeVersion: systemFFprobe.version,
          resolvedFolder: path.dirname(systemFFmpeg.filePath),
        };
        this.logResolution(resolution);
        this.cachedResolution = resolution;
        return resolution;
      }
    }

    if (systemFFmpeg || systemFFprobe) {
      const resolution: ExecutableResolution = {
        ffmpegPath: systemFFmpeg?.filePath ?? null,
        ffprobePath: systemFFprobe?.filePath ?? null,
        source: 'SYSTEM_PATH',
        ffmpegAvailable: systemFFmpeg !== null,
        ffprobeAvailable: systemFFprobe !== null,
        ffmpegVersion: systemFFmpeg?.version,
        ffprobeVersion: systemFFprobe?.version,
        resolvedFolder: path.dirname((systemFFmpeg ?? systemFFprobe)!.filePath),
      };
      this.logResolution(resolution);
      this.cachedResolution = resolution;
      return resolution;
    }

    // 5. NOT_FOUND fallback
    const resolution: ExecutableResolution = {
      ffmpegPath: null,
      ffprobePath: null,
      source: 'NOT_FOUND',
      ffmpegAvailable: false,
      ffprobeAvailable: false,
    };
    this.logResolution(resolution);
    this.cachedResolution = resolution;
    return resolution;
  }

  public async getFFmpegPath(): Promise<string> {
    const res = await this.resolve();
    if (res.ffmpegAvailable && res.ffmpegPath) {
      return res.ffmpegPath;
    }
    throw new AppError(
      'FFMPEG_MISSING',
      'Không tìm thấy FFmpeg. Hãy cài đặt FFmpeg hoặc chọn đúng thư mục chứa ffmpeg.exe và ffprobe.exe trong phần Cài đặt.'
    );
  }

  public async getFFprobePath(): Promise<string> {
    const res = await this.resolve();
    if (res.ffprobeAvailable && res.ffprobePath) {
      return res.ffprobePath;
    }
    throw new AppError(
      'FFPROBE_MISSING',
      'Không tìm thấy FFprobe. Hãy cài đặt FFmpeg hoặc chọn đúng thư mục chứa ffmpeg.exe và ffprobe.exe trong phần Cài đặt.'
    );
  }

  public async getStatus(): Promise<{
    installed: boolean;
    version: string;
    path: string;
    probePath: string;
    resolution: ExecutableResolution;
  }> {
    const res = await this.resolve();
    return {
      installed: res.ffmpegAvailable && res.ffprobeAvailable,
      version: res.ffmpegVersion || res.ffprobeVersion || 'Not Found',
      path: res.ffmpegPath || '',
      probePath: res.ffprobePath || '',
      resolution: res,
    };
  }

  public async setCustomFolder(folderPath: string): Promise<ExecutableResolution> {
    if (!folderPath || !fs.existsSync(folderPath)) {
      throw new AppError('INVALID_INPUT', `Thư mục không tồn tại: ${folderPath}`);
    }

    const isWin = process.platform === 'win32';
    const exeExt = isWin ? '.exe' : '';
    const ffmpegP = path.join(folderPath, `ffmpeg${exeExt}`);
    const ffprobeP = path.join(folderPath, `ffprobe${exeExt}`);

    const ffmpegVal = await this.validateExecutable(ffmpegP, /ffmpeg version/i);
    const ffprobeVal = await this.validateExecutable(ffprobeP, /ffprobe version/i);

    if (!ffmpegVal.valid) {
      throw new AppError('FFMPEG_MISSING', `Thư mục không chứa ffmpeg.exe hợp lệ (${folderPath})`);
    }

    if (!ffprobeVal.valid) {
      throw new AppError('FFPROBE_MISSING', `Thư mục không chứa ffprobe.exe hợp lệ (${folderPath})`);
    }

    if (this.settingsRepo) {
      this.settingsRepo.updateSettings({
        ffmpegPath: ffmpegP,
        ffprobePath: ffprobeP,
      });
    }

    this.invalidateCache();
    return this.resolve(true);
  }

  private validateExecutable(
    execPath: string,
    expectedPattern: RegExp
  ): Promise<{ valid: boolean; version?: string }> {
    return new Promise((resolve) => {
      if (!execPath || !fs.existsSync(execPath)) {
        return resolve({ valid: false });
      }

      try {
        const stat = fs.statSync(execPath);
        if (!stat.isFile()) return resolve({ valid: false });
      } catch {
        return resolve({ valid: false });
      }

      execFile(execPath, ['-version'], { timeout: 3000, windowsHide: true }, (err, stdout) => {
        if (err || !stdout) {
          return resolve({ valid: false });
        }

        const match = stdout.match(expectedPattern);
        if (match) {
          const versionMatch = stdout.match(/(?:ffmpeg|ffprobe) version\s+([^\s]+)/i);
          const version = versionMatch ? versionMatch[1] : 'Installed';
          return resolve({ valid: true, version });
        }

        resolve({ valid: false });
      });
    });
  }

  private logResolution(res: ExecutableResolution): void {
    console.log(
      `[FFmpegManager] Resolved Executables -> Source: ${res.source} | FFmpeg: ${res.ffmpegPath} (${res.ffmpegAvailable ? 'OK' : 'MISSING'}) | FFprobe: ${res.ffprobePath} (${res.ffprobeAvailable ? 'OK' : 'MISSING'})`
    );
  }
}
