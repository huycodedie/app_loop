import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateRepeatPlan } from '../src/shared/utils/repeatPlan';
import { resolveOutputDirectory } from '../src/shared/utils/outputDirectoryResolver';
import { DEFAULT_SETTINGS } from '../src/shared/constants';
import { WatchFolderService } from '../src/main/services/WatchFolderService';

describe('Background Processing & System Tray Architecture Unit Tests', () => {
  describe('1. Background Math & Directory Resolution without DOM/Renderer', () => {
    it('should compute RepeatPlan for Watch Folder job in background without UI', () => {
      const plan = calculateRepeatPlan(590, 10, true, 10800); // 9m50s source, 3h target
      expect(plan.effectiveRepeatCount).toBe(19);
      expect(plan.fullCopyCount).toBe(18);
      expect(plan.partialCopyDurationSeconds).toBeCloseTo(180, 2);
      expect(plan.effectiveDurationSeconds).toBe(10800);
    });

    it('should resolve local-date output subfolders in background', () => {
      const fixedDate = new Date(2026, 7, 16, 22, 0, 0); // August 16, 2026
      const res = resolveOutputDirectory({
        baseOutputDirectory: 'D:\\Repeat_Output',
        autoDailyFolder: true,
        jobStartedAt: fixedDate,
      });

      expect(res.dailyFolderName).toBe('16_8');
      expect(res.resolvedOutputDirectory).toBe('D:\\Repeat_Output\\16_8');
    });
  });

  describe('2. Background Settings Defaults', () => {
    it('should include correct background processing defaults', () => {
      expect(DEFAULT_SETTINGS.runInBackground).toBe(true);
      expect(DEFAULT_SETTINGS.closeBehavior).toBe('TRAY');
      expect(DEFAULT_SETTINGS.launchAtStartup).toBe(false);
      expect(DEFAULT_SETTINGS.startMinimized).toBe(false);
      expect(DEFAULT_SETTINGS.showCloseToTrayNotification).toBe(true);
      expect(DEFAULT_SETTINGS.backgroundCompletionNotifications).toBe(true);
    });
  });

  describe('3. WatchFolderService Lifecycle & Duplicate Protection', () => {
    let watchRepoMock: any;
    let queueServiceMock: any;
    let watchService: WatchFolderService;

    beforeEach(() => {
      watchRepoMock = {
        getAllWatchFolders: vi.fn().mockReturnValue([
          {
            id: 'wf_1',
            folderPath: 'C:\\fake_input',
            outputFolder: 'C:\\fake_output',
            repeatCount: 5,
            enabled: true,
          },
        ]),
        isFileProcessed: vi.fn().mockReturnValue(false),
        recordProcessedFile: vi.fn(),
      };

      queueServiceMock = {
        addJob: vi.fn().mockResolvedValue({ id: 'job_123' }),
      };

      watchService = new WatchFolderService(watchRepoMock, queueServiceMock);
    });

    it('should track pauseAll and resumeAll state without crashing', () => {
      expect(watchService.isPausedState()).toBe(false);

      watchService.pauseAll();
      expect(watchService.isPausedState()).toBe(true);
      expect(watchService.getStatus().isPaused).toBe(true);

      watchService.resumeAll();
      expect(watchService.isPausedState()).toBe(false);
      expect(watchService.getStatus().isPaused).toBe(false);
    });

    it('should cleanly shut down watchers on application exit', () => {
      watchService.shutdown();
      expect(watchService.isPausedState()).toBe(true);
      expect(watchService.getStatus().active).toBe(0);
    });
  });
});
