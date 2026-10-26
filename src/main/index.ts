import { app, BrowserWindow, protocol, net, dialog, Notification } from 'electron';
import path from 'path';
import { pathToFileURL } from 'node:url';

app.name = 'Video Repeat Studio';

import { SettingsRepository } from './repositories/SettingsRepository';
import { JobsRepository } from './repositories/JobsRepository';
import { HistoryRepository } from './repositories/HistoryRepository';
import { WatchFolderRepository } from './repositories/WatchFolderRepository';
import { ProfilesRepository } from './repositories/ProfilesRepository';
import { SchedulesRepository } from './repositories/SchedulesRepository';

import { FFmpegManager } from './ffmpeg/FFmpegManager';
import { FFprobeService } from './ffmpeg/FFprobeService';
import { GpuManager } from './gpu/GpuManager';
import { VideoEngine } from './ffmpeg/VideoEngine';
import { TempFileManager } from './services/TempFileManager';
import { QueueService } from './services/QueueService';
import { WatchFolderService } from './services/WatchFolderService';
import { PerformanceMonitor } from './services/PerformanceMonitor';
import { SchedulerService } from './services/SchedulerService';
import { TrayService } from './services/TrayService';
import { SourceFileStatusService } from './services/SourceFileStatusService';
import { Logger, logger } from './services/Logger';
import { RuntimeValidator } from './services/RuntimeValidator';
import { AutoUpdateService } from './services/AutoUpdateService';

import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { IPC_CHANNELS } from '@shared/constants';

// Global Exception Handlers
process.on('uncaughtException', (err: Error) => {
  logger.error('CRASH', 'Uncaught Exception in Main Process', err);
  try {
    dialog.showErrorBox(
      'Lỗi hệ thống nghiêm trọng',
      `Đã xảy ra lỗi ngoài dự kiến:\n${err.message}\n\nNhật ký chi tiết tại:\n${logger.getLogFilePath()}`
    );
  } catch {
    // Fallback if UI dialog fails
  }
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('CRASH', 'Unhandled Rejection in Main Process', reason);
});

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

if (app) {
  app.name = 'Video Repeat Studio';
  app.setPath('userData', path.join(app.getPath('appData'), 'Video Repeat Studio'));
}

let mainWindow: BrowserWindow | null = null;
let isQuitting: boolean = false;
let hasShownCloseNotification: boolean = false;

// Global service references
let settingsRepo: SettingsRepository;
let jobsRepo: JobsRepository;
let historyRepo: HistoryRepository;
let watchRepo: WatchFolderRepository;
let profilesRepo: ProfilesRepository;
let schedulesRepo: SchedulesRepository;

let ffmpegManager: FFmpegManager;
let ffprobeService: FFprobeService;
let gpuManager: GpuManager;
let tempFileManager: TempFileManager;
let videoEngine: VideoEngine;
let queueService: QueueService;
let watchFolderService: WatchFolderService;
let performanceMonitor: PerformanceMonitor;
let schedulerService: SchedulerService;
let trayService: TrayService;
let sourceStatusService: SourceFileStatusService;

function showMainWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();

  // Hydrate latest queue state to Renderer upon window restore
  if (queueService && mainWindow.webContents) {
    mainWindow.webContents.send(IPC_CHANNELS.EVENT_QUEUE_UPDATED, queueService.getQueue());
  }

  return mainWindow;
}

async function quitApplication(): Promise<void> {
  if (queueService && queueService.getQueueSummary().processingCount > 0) {
    const activeJob = queueService.getQueueSummary().activeJobName || 'Video';
    const result = await dialog.showMessageBox(mainWindow && !mainWindow.isDestroyed() ? mainWindow : (undefined as any), {
      type: 'warning',
      title: 'Video đang được xử lý',
      message: `Đang xử lý: ${activeJob}`,
      detail: 'Tác vụ lặp video đang chạy. Bạn muốn xử lý thế nào?',
      buttons: [
        'Tiếp tục chạy nền',          // 0
        'Thoát sau khi hoàn thành',   // 1
        'Dừng xử lý và thoát',        // 2
        'Hủy'                         // 3
      ],
      defaultId: 0,
      cancelId: 3,
      noLink: true,
    });

    if (result.response === 0) {
      // Continue running in background
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }
      return;
    }

    if (result.response === 1) {
      // Quit after current job completes
      queueService.setQuitAfterCurrentJob(true);
      watchFolderService.pauseAll();
      schedulerService.stop();
      if (trayService) trayService.updateTrayMenu();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }
      return;
    }

    if (result.response === 2) {
      // Stop processing immediately and exit
      isQuitting = true;
      await queueService.cancelActiveJobAndWait();
    }

    if (result.response === 3) {
      return;
    }
  }

  isQuitting = true;
  if (watchFolderService) watchFolderService.shutdown();
  if (schedulerService) schedulerService.stop();
  if (performanceMonitor) performanceMonitor.stopMonitoring();
  if (trayService) trayService.destroy();

  app.quit();
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'Video Repeat Studio',
    backgroundColor: '#070B14',
    show: false, // Initially hidden until loaded / checked for startMinimized
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Renderer Crash Handler
  win.webContents.on('render-process-gone', (_, details) => {
    logger.error('CRASH', `Renderer process gone. Reason: ${details.reason}, exitCode: ${details.exitCode}`);
    dialog.showErrorBox(
      'Ứng dụng bị gián đoạn',
      `Tiến trình giao diện (Renderer) đã bị đóng bất ngờ.\nLý do: ${details.reason}`
    );
  });

  // Intercept X button close
  win.on('close', (event) => {
    if (isQuitting) return;

    const settings = settingsRepo ? settingsRepo.getSettings() : null;
    const runBg = settings ? (settings.closeBehavior === 'TRAY' || settings.runInBackground) : true;

    if (runBg) {
      event.preventDefault();
      win.hide();

      if (settings?.showCloseToTrayNotification && !hasShownCloseNotification) {
        hasShownCloseNotification = true;
        if (Notification.isSupported()) {
          new Notification({
            title: 'Video Repeat Studio vẫn đang chạy',
            body: 'Thư mục theo dõi và Hàng chờ sẽ tiếp tục hoạt động trong nền. Bạn có thể mở lại ứng dụng từ biểu tượng ở khay hệ thống.',
          }).show();
        }
      }
    } else {
      event.preventDefault();
      quitApplication();
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  // Register IPC Handlers for new window
  registerIpcHandlers(
    win,
    settingsRepo,
    jobsRepo,
    historyRepo,
    watchRepo,
    profilesRepo,
    schedulesRepo,
    ffmpegManager,
    ffprobeService,
    gpuManager,
    videoEngine,
    queueService,
    watchFolderService,
    performanceMonitor,
    sourceStatusService
  );

  // Load UI
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.warn('STARTUP', 'Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    logger.info('STARTUP', 'Second instance detected. Restoring existing main window.');
    showMainWindow();
  });

  app.whenReady().then(async () => {
    logger.info('STARTUP', `Video Repeat Studio v${app.getVersion()} starting on ${process.platform} (${process.arch})`);

    // 0. Custom Protocol for Secure Media Preview
    protocol.handle('video-media', (request) => {
      try {
        const rawPath = request.url.substring('video-media://'.length);
        const decodedPath = decodeURIComponent(rawPath);
        return net.fetch(pathToFileURL(decodedPath).href);
      } catch (err) {
        logger.error('IPC', 'Failed to handle video-media protocol request', err);
        return new Response('File not found', { status: 404 });
      }
    });

    // 1. Initialize Repositories
    settingsRepo = new SettingsRepository();
    jobsRepo = new JobsRepository();
    historyRepo = new HistoryRepository();
    watchRepo = new WatchFolderRepository();
    profilesRepo = new ProfilesRepository();
    schedulesRepo = new SchedulesRepository();

    // 2. Initialize Services & Managers
    sourceStatusService = new SourceFileStatusService();
    ffmpegManager = new FFmpegManager(settingsRepo);
    ffprobeService = new FFprobeService(ffmpegManager);
    gpuManager = new GpuManager(ffmpegManager);
    tempFileManager = new TempFileManager(settingsRepo.getSettings().tempFolder);
    tempFileManager.cleanupAbandonedDirectories();

    videoEngine = new VideoEngine(ffmpegManager, ffprobeService, gpuManager, tempFileManager);
    queueService = new QueueService(jobsRepo, historyRepo, settingsRepo, videoEngine, ffprobeService, sourceStatusService);
    watchFolderService = new WatchFolderService(watchRepo, queueService, sourceStatusService, settingsRepo);
    performanceMonitor = new PerformanceMonitor();
    schedulerService = new SchedulerService(schedulesRepo, queueService);

    // Subscribe to Quit-after-job-ready event from QueueService
    queueService.on('quit-after-job-ready', () => {
      logger.info('QUEUE', 'Quit after job completed. Performing final exit...');
      quitApplication();
    });

    // 3. Startup Runtime Validation Check
    const runtimeValidator = new RuntimeValidator(ffmpegManager, gpuManager);
    const validationReport = await runtimeValidator.validateOnStartup();
    logger.info('STARTUP', `Runtime Validation Completed. Status: ${validationReport.success ? 'PASSED' : 'WARNING/FAILED'}`);

    // 4. Initialize Auto-Updater Architecture
    const autoUpdateService = new AutoUpdateService();
    autoUpdateService.init();

    // 5. Initialize Background Services
    watchFolderService.initWatchers();
    schedulerService.start();
    performanceMonitor.startMonitoring();

    // 6. Initialize System Tray
    trayService = new TrayService(settingsRepo, watchFolderService, queueService, {
      onShowMainWindow: () => showMainWindow(),
      onQuitApp: () => quitApplication(),
    });
    trayService.init();

    // 7. Create Main Window (check startMinimized / --minimized flag)
    mainWindow = createMainWindow();

    const isMinimizedLaunch = process.argv.includes('--minimized') || process.argv.includes('--hidden') || settingsRepo.getSettings().startMinimized;
    if (!isMinimizedLaunch) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      logger.info('STARTUP', 'Application started minimized to System Tray.');
    }
  });

  app.on('window-all-closed', () => {
    logger.info('STARTUP', 'All windows closed event fired.');
    const settings = settingsRepo ? settingsRepo.getSettings() : null;
    const runBg = settings ? (settings.closeBehavior === 'TRAY' || settings.runInBackground) : true;
    if (!runBg && isQuitting) {
      app.quit();
    }
  });
}

export { showMainWindow, quitApplication };
