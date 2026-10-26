import { autoUpdater, UpdateInfo } from 'electron-updater';
import { ipcMain } from 'electron';
import { logger } from './Logger';

export class AutoUpdateService {
  private isInitialized = false;

  constructor() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
  }

  public init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    autoUpdater.on('checking-for-update', () => {
      logger.info('UPDATER', 'Checking for application updates...');
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      logger.info('UPDATER', `Update available: v${info.version}`);
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      logger.info('UPDATER', `No update available. Current version is up to date (v${info.version}).`);
    });

    autoUpdater.on('error', (err: Error) => {
      logger.error('UPDATER', 'Auto-updater error occurred', err);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      logger.info('UPDATER', `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      logger.info('UPDATER', `Update downloaded: v${info.version}. Ready to install.`);
    });

    // IPC channel for update checks
    ipcMain.handle('updater:check', async () => {
      try {
        logger.info('UPDATER', 'Manual check for updates requested via IPC');
        const result = await autoUpdater.checkForUpdates();
        return {
          available: result?.updateInfo ? result.updateInfo.version !== autoUpdater.currentVersion.version : false,
          version: result?.updateInfo?.version || null,
        };
      } catch (err: any) {
        logger.warn('UPDATER', `Check for updates skipped or failed: ${err.message}`);
        return { available: false, error: err.message };
      }
    });

    logger.info('UPDATER', 'AutoUpdateService initialized successfully (Architecture ready).');
  }

  public async checkForUpdatesSilently(): Promise<void> {
    try {
      await autoUpdater.checkForUpdatesAndNotify();
    } catch (err: any) {
      logger.debug('UPDATER', `Silent update check skipped: ${err.message}`);
    }
  }
}
