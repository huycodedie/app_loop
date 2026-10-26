import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export class TempFileManager {
  private baseTempDir: string;

  constructor(customTempFolder?: string) {
    if (customTempFolder && fs.existsSync(customTempFolder)) {
      this.baseTempDir = customTempFolder;
    } else {
      const rootPath = app ? app.getPath('userData') : process.cwd();
      this.baseTempDir = path.join(rootPath, 'temp');
    }

    if (!fs.existsSync(this.baseTempDir)) {
      fs.mkdirSync(this.baseTempDir, { recursive: true });
    }
  }

  public createJobDirectory(jobId: string): string {
    const jobDir = path.join(this.baseTempDir, `job_${jobId}`);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }
    return jobDir;
  }

  public cleanupJobDirectory(jobId: string): void {
    const jobDir = path.join(this.baseTempDir, `job_${jobId}`);
    if (fs.existsSync(jobDir)) {
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
      } catch {
        // Safe ignore if locked
      }
    }
  }

  public cleanupAbandonedDirectories(): void {
    if (!fs.existsSync(this.baseTempDir)) return;

    try {
      const files = fs.readdirSync(this.baseTempDir);
      for (const file of files) {
        if (file.startsWith('job_')) {
          const fullPath = path.join(this.baseTempDir, file);
          try {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } catch {
            // Safe ignore
          }
        }
      }
    } catch {
      // Safe ignore
    }
  }
}
