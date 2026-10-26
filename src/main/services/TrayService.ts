import { app, Tray, Menu, nativeImage, shell, NativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { WatchFolderService } from './WatchFolderService';
import { QueueService } from './QueueService';
import { SettingsRepository } from '../repositories/SettingsRepository';
import { logger } from './Logger';

export interface TrayServiceCallbacks {
  onShowMainWindow: () => void;
  onQuitApp: () => void;
}

export class TrayService {
  private tray: Tray | null = null;
  private lastUpdate: number = 0;
  private updateTimer: NodeJS.Timeout | null = null;

  constructor(
    private settingsRepo: SettingsRepository,
    private watchFolderService: WatchFolderService,
    private queueService: QueueService,
    private callbacks: TrayServiceCallbacks
  ) {}

  public init(): void {
    if (this.tray) return;

    try {
      const icon = this.getTrayIcon();
      this.tray = new Tray(icon);
      this.tray.setToolTip('Video Repeat Studio');

      // Click or double-click to restore/focus main window
      this.tray.on('click', () => {
        this.callbacks.onShowMainWindow();
      });

      this.tray.on('double-click', () => {
        this.callbacks.onShowMainWindow();
      });

      // Subscribe to Queue events for live tray updates
      this.queueService.on('progress', () => this.scheduleTrayUpdate());
      this.queueService.on('queue-updated', () => this.scheduleTrayUpdate());

      this.updateTrayMenu();
      logger.info('STARTUP', 'System Tray initialized successfully.');
    } catch (err) {
      logger.error('STARTUP', 'Failed to initialize System Tray', err);
    }
  }

  public updateTrayMenu(): void {
    if (!this.tray) return;

    try {
      const settings = this.settingsRepo.getSettings();
      const wfStatus = this.watchFolderService.getStatus();
      const qSummary = this.queueService.getQueueSummary();
      const loginSettings = app.getLoginItemSettings ? app.getLoginItemSettings() : { openAtLogin: false };

      let wfText = 'Watch Folder: Tắt';
      if (wfStatus.isPaused) {
        wfText = 'Watch Folder: Tạm dừng';
      } else if (wfStatus.hasError) {
        wfText = 'Watch Folder: Có lỗi';
      } else if (wfStatus.active > 0) {
        wfText = `Watch Folder: Đang hoạt động (${wfStatus.active} quy tắc)`;
      } else {
        wfText = 'Watch Folder: Chưa có quy tắc bật';
      }

      let qText = 'Hàng chờ: Đang rảnh';
      if (qSummary.activeJobName) {
        qText = `Đang xử lý: ${qSummary.activeJobName} (${Math.round(qSummary.activeProgress)}%)`;
      } else if (qSummary.pendingCount > 0) {
        qText = `Hàng chờ: ${qSummary.pendingCount} video đang chờ`;
      }

      if (this.queueService.isQuittingAfterCurrentJob()) {
        qText = 'Đang chờ hoàn thành để thoát...';
      }

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Mở Video Repeat Studio',
          type: 'normal',
          click: () => this.callbacks.onShowMainWindow(),
        },
        { type: 'separator' },
        {
          label: wfText,
          enabled: false,
        },
        {
          label: wfStatus.isPaused ? 'Tiếp tục Thư mục theo dõi' : 'Tạm dừng Thư mục theo dõi',
          type: 'normal',
          click: () => {
            if (wfStatus.isPaused) {
              this.watchFolderService.resumeAll();
            } else {
              this.watchFolderService.pauseAll();
            }
            this.updateTrayMenu();
          },
        },
        {
          label: qText,
          enabled: false,
        },
        {
          label: 'Mở thư mục đầu ra',
          type: 'normal',
          click: () => {
            const outDir = settings.outputFolder || app.getPath('videos');
            if (fs.existsSync(outDir)) {
              shell.openPath(outDir);
            } else {
              shell.openPath(app.getPath('userData'));
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Khởi động cùng Windows',
          type: 'checkbox',
          checked: settings.launchAtStartup || loginSettings.openAtLogin,
          click: (menuItem) => {
            const enabled = menuItem.checked;
            if (app.setLoginItemSettings) {
              app.setLoginItemSettings({
                openAtLogin: enabled,
                args: enabled && settings.startMinimized ? ['--minimized'] : [],
              });
            }
            this.settingsRepo.updateSettings({ launchAtStartup: enabled });
            this.updateTrayMenu();
            logger.info('SETTINGS', `Launch at startup set to: ${enabled}`);
          },
        },
        { type: 'separator' },
        {
          label: 'Thoát Video Repeat Studio',
          type: 'normal',
          click: () => this.callbacks.onQuitApp(),
        },
      ]);

      this.tray.setContextMenu(contextMenu);
      this.tray.setToolTip(`Video Repeat Studio\n${wfText}\n${qText}`);
    } catch (err) {
      logger.error('SYSTEM', 'Error updating Tray menu', err);
    }
  }

  public scheduleTrayUpdate(): void {
    const now = Date.now();
    if (now - this.lastUpdate >= 1000) {
      this.lastUpdate = now;
      this.updateTrayMenu();
    } else if (!this.updateTimer) {
      this.updateTimer = setTimeout(() => {
        this.updateTimer = null;
        this.lastUpdate = Date.now();
        this.updateTrayMenu();
      }, 1000 - (now - this.lastUpdate));
    }
  }

  public destroy(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
      logger.info('SYSTEM', 'System Tray destroyed.');
    }
  }

  private getTrayIcon(): NativeImage {
    // 1. Check for bundled icon file in resources
    const possiblePaths = [
      path.join(process.resourcesPath || '', 'resources', 'tray-icon.png'),
      path.join(process.resourcesPath || '', 'tray-icon.png'),
      path.join(app.getAppPath(), 'resources', 'tray-icon.png'),
      path.join(process.cwd(), 'resources', 'tray-icon.png'),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
      }
    }

    // 2. Generate a clean fallback 16x16 PNG icon programmatically if file doesn't exist
    return this.createFallbackNativeImage();
  }

  private createFallbackNativeImage(): NativeImage {
    // Return a solid blue 16x16 native icon for system tray
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAXSURBVDhPY2BgYPgPxAw0BEw0Bh4MBADJfg/5qRerqwAAAABJRU5ErkJggg==',
      'base64'
    );
    return nativeImage.createFromBuffer(buffer);
  }
}
