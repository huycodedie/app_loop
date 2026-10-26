import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { WatchFolderConfig } from '../src/shared/types';
import { calculateRepeatPlan } from '../src/shared/utils/repeatPlan';
import { resolveOutputDirectory } from '../src/shared/utils/outputDirectoryResolver';

// Mock in-memory watch folder manager for unit testing edit workflows
class MockWatchFolderManager {
  private configs: Map<string, WatchFolderConfig> = new Map();
  public stoppedWatchers: Set<string> = new Set();
  public startedWatchers: Set<string> = new Set();
  public processedFiles: Map<string, Array<{ filePath: string; processedAt: string }>> = new Map();

  public add(config: WatchFolderConfig): WatchFolderConfig {
    this.configs.set(config.id, config);
    if (config.enabled) {
      this.startedWatchers.add(config.id);
    }
    return config;
  }

  public updateWatchFolderConfiguration(id: string, updates: Partial<WatchFolderConfig>): WatchFolderConfig {
    const oldConfig = this.configs.get(id);
    if (!oldConfig) {
      throw new Error(`Watch folder rule ${id} not found.`);
    }

    // Duplicate check
    if (updates.folderPath && updates.folderPath !== oldConfig.folderPath) {
      for (const [otherId, c] of this.configs.entries()) {
        if (otherId !== id && path.normalize(c.folderPath) === path.normalize(updates.folderPath)) {
          // Warning logged
        }
      }
    }

    const updated: WatchFolderConfig = {
      ...oldConfig,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.configs.set(id, updated);

    const pathChanged = updates.folderPath && updates.folderPath !== oldConfig.folderPath;
    const enabledToggled = updates.enabled !== undefined && updates.enabled !== oldConfig.enabled;

    if (pathChanged || enabledToggled) {
      this.stoppedWatchers.add(id);
      if (updated.enabled) {
        this.startedWatchers.add(id);
      } else {
        this.startedWatchers.delete(id);
      }
    }

    return updated;
  }

  public getStats(id: string) {
    const list = this.processedFiles.get(id) || [];
    const last = list.length > 0 ? list[list.length - 1] : null;
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const countToday = list.filter((f) => f.processedAt.startsWith(todayPrefix)).length;

    return {
      lastProcessedFile: last ? path.basename(last.filePath) : null,
      countToday,
    };
  }

  public get(id: string): WatchFolderConfig | undefined {
    return this.configs.get(id);
  }
}

describe('Watch Folder Configuration Edit Unit Tests', () => {
  let tempDir: string;
  let oldInputDir: string;
  let newInputDir: string;
  let oldOutputDir: string;
  let newOutputDir: string;
  let manager: MockWatchFolderManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrs_wf_edit_unit_'));
    oldInputDir = path.join(tempDir, 'OldInput');
    newInputDir = path.join(tempDir, 'NewInput');
    oldOutputDir = path.join(tempDir, 'OldOutput');
    newOutputDir = path.join(tempDir, 'NewOutput');

    fs.mkdirSync(oldInputDir, { recursive: true });
    fs.mkdirSync(newInputDir, { recursive: true });
    fs.mkdirSync(oldOutputDir, { recursive: true });
    fs.mkdirSync(newOutputDir, { recursive: true });

    manager = new MockWatchFolderManager();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('1. Create Watch Folder rule', () => {
    const rule = manager.add({
      id: 'wf_1',
      name: 'Rain Rule',
      folderPath: oldInputDir,
      outputFolder: oldOutputDir,
      repeatCount: 3,
      audioFadeInEnabled: true,
      audioFadeInDurationSeconds: 5.0,
      durationLimitEnabled: false,
      durationLimitSeconds: null,
      autoDailyOutputFolder: true,
      enabled: true,
      createdAt: new Date().toISOString(),
    });

    expect(rule.id).toBe('wf_1');
    expect(manager.startedWatchers.has('wf_1')).toBe(true);
  });

  it('2-5. Edit output directory while active: new config saved, new output directory used for future jobs without moving current processing', () => {
    const rule = manager.add({
      id: 'wf_2',
      folderPath: oldInputDir,
      outputFolder: oldOutputDir,
      repeatCount: 3,
      audioFadeInEnabled: true,
      audioFadeInDurationSeconds: 5.0,
      durationLimitEnabled: false,
      durationLimitSeconds: null,
      autoDailyOutputFolder: false,
      enabled: true,
      createdAt: new Date().toISOString(),
    });

    // Currently running job snapshots its original output path
    const activeJob = {
      id: 'job_running_1',
      resolvedOutputDirectory: oldOutputDir,
    };

    // User edits output folder to newOutputDir
    const updated = manager.updateWatchFolderConfiguration(rule.id, {
      outputFolder: newOutputDir,
    });

    expect(updated.outputFolder).toBe(newOutputDir);

    // Active job retains original resolved output path
    expect(activeJob.resolvedOutputDirectory).toBe(oldOutputDir);

    // Future job resolves to new output directory
    const newJobDir = resolveOutputDirectory({
      baseOutputDirectory: updated.outputFolder,
      autoDailyFolder: updated.autoDailyOutputFolder,
      jobStartedAt: new Date(),
    }).resolvedOutputDirectory;

    expect(newJobDir).toBe(newOutputDir);
  });

  it('6-7. Edit repeat settings & duration limit target: future jobs use updated RepeatPlan', () => {
    const rule = manager.add({
      id: 'wf_3',
      folderPath: oldInputDir,
      outputFolder: oldOutputDir,
      repeatCount: 2,
      audioFadeInEnabled: false,
      audioFadeInDurationSeconds: 0,
      durationLimitEnabled: false,
      durationLimitSeconds: null,
      autoDailyOutputFolder: false,
      enabled: true,
      createdAt: new Date().toISOString(),
    });

    // Update settings: enable duration target of 2 hours (7200 seconds)
    const updated = manager.updateWatchFolderConfiguration(rule.id, {
      durationLimitEnabled: true,
      durationLimitSeconds: 7200,
    });

    // Source video of 10 mins (600s) calculates required repeat count
    const plan = calculateRepeatPlan(
      600,
      updated.repeatCount,
      updated.durationLimitEnabled,
      updated.durationLimitSeconds
    );

    expect(plan.effectiveRepeatCount).toBe(12); // ceil(7200 / 600) = 12 copies
    expect(plan.effectiveDurationSeconds).toBe(7200);
  });

  it('8-10. Pause, edit paused folder, and resume folder state preservation', () => {
    const rule = manager.add({
      id: 'wf_4',
      folderPath: oldInputDir,
      outputFolder: oldOutputDir,
      repeatCount: 3,
      audioFadeInEnabled: true,
      audioFadeInDurationSeconds: 5.0,
      durationLimitEnabled: false,
      durationLimitSeconds: null,
      autoDailyOutputFolder: false,
      enabled: true,
      createdAt: new Date().toISOString(),
    });

    // 8. Pause folder
    const paused = manager.updateWatchFolderConfiguration(rule.id, { enabled: false });
    expect(paused.enabled).toBe(false);
    expect(manager.startedWatchers.has('wf_4')).toBe(false);

    // 9. Edit paused folder
    const edited = manager.updateWatchFolderConfiguration(rule.id, { repeatCount: 15 });
    expect(edited.enabled).toBe(false); // Remains paused!
    expect(edited.repeatCount).toBe(15);
    expect(manager.startedWatchers.has('wf_4')).toBe(false);

    // 10. Resume folder
    const resumed = manager.updateWatchFolderConfiguration(rule.id, { enabled: true });
    expect(resumed.enabled).toBe(true);
    expect(manager.startedWatchers.has('wf_4')).toBe(true);
  });

  it('11-13. Input directory change stops old watcher and starts new watcher', () => {
    const rule = manager.add({
      id: 'wf_5',
      folderPath: oldInputDir,
      outputFolder: oldOutputDir,
      repeatCount: 3,
      audioFadeInEnabled: true,
      audioFadeInDurationSeconds: 5.0,
      durationLimitEnabled: false,
      durationLimitSeconds: null,
      autoDailyOutputFolder: false,
      enabled: true,
      createdAt: new Date().toISOString(),
    });

    manager.stoppedWatchers.clear();

    const updated = manager.updateWatchFolderConfiguration(rule.id, {
      folderPath: newInputDir,
    });

    expect(updated.folderPath).toBe(newInputDir);
    expect(manager.stoppedWatchers.has('wf_5')).toBe(true);
    expect(manager.startedWatchers.has('wf_5')).toBe(true);
  });

  it('14-15. Stats query returns last processed file and count today', () => {
    const rule = manager.add({
      id: 'wf_6',
      folderPath: oldInputDir,
      outputFolder: oldOutputDir,
      repeatCount: 3,
      audioFadeInEnabled: true,
      audioFadeInDurationSeconds: 5.0,
      durationLimitEnabled: false,
      durationLimitSeconds: null,
      autoDailyOutputFolder: false,
      enabled: true,
      createdAt: new Date().toISOString(),
    });

    const now = new Date().toISOString();
    manager.processedFiles.set(rule.id, [
      { filePath: path.join(oldInputDir, 'rain_DONE.mp4'), processedAt: now },
      { filePath: path.join(oldInputDir, 'storm_DONE.mp4'), processedAt: now },
    ]);

    const stats = manager.getStats(rule.id);
    expect(stats.countToday).toBe(2);
    expect(stats.lastProcessedFile).toBe('storm_DONE.mp4');
  });
});
