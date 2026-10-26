import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
export type LogCategory =
  | 'STARTUP'
  | 'FFMPEG'
  | 'DATABASE'
  | 'SCHEDULER'
  | 'QUEUE'
  | 'WATCH_FOLDER'
  | 'SETTINGS'
  | 'CRASH'
  | 'UPDATER'
  | 'IPC'
  | 'SYSTEM';

export class Logger {
  private static instance: Logger | null = null;

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public getLogDirPath(): string {
    let userDataPath: string;
    if (app && app.isReady()) {
      try {
        userDataPath = app.getPath('userData');
      } catch {
        const baseAppDir = process.env.APPDATA || process.cwd();
        userDataPath = path.join(baseAppDir, 'Video Repeat Studio');
      }
    } else {
      const baseAppDir = process.env.APPDATA || process.cwd();
      userDataPath = path.join(baseAppDir, 'Video Repeat Studio');
    }

    const logDir = path.join(userDataPath, 'logs');
    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create log directory:', err);
    }
    return logDir;
  }

  public getLogFilePath(): string {
    const today = new Date().toISOString().slice(0, 10);
    return path.join(this.getLogDirPath(), `video_repeat_studio_${today}.log`);
  }

  public log(level: LogLevel, category: LogCategory, message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    let metaString = '';

    if (meta !== undefined) {
      if (meta instanceof Error) {
        metaString = ` | Error: ${meta.message}${meta.stack ? `\nStack: ${meta.stack}` : ''}`;
      } else {
        try {
          metaString = ` | ${JSON.stringify(meta)}`;
        } catch {
          metaString = ` | [Object]`;
        }
      }
    }

    const logLine = `[${timestamp}] [${level}] [${category}] ${message}${metaString}\n`;

    // Console output
    console.log(logLine.trim());

    // File output
    try {
      const filePath = this.getLogFilePath();
      fs.appendFileSync(filePath, logLine, 'utf8');
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  public info(category: LogCategory, message: string, meta?: any): void {
    this.log('INFO', category, message, meta);
  }

  public warn(category: LogCategory, message: string, meta?: any): void {
    this.log('WARN', category, message, meta);
  }

  public error(category: LogCategory, message: string, meta?: any): void {
    this.log('ERROR', category, message, meta);
  }

  public debug(category: LogCategory, message: string, meta?: any): void {
    this.log('DEBUG', category, message, meta);
  }
}

export const logger = Logger.getInstance();
