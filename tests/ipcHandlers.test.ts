import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, IPC_CHANNELS } from '../src/shared/constants';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  setLoginItemSettings: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { setLoginItemSettings: electron.setLoginItemSettings },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => electron.handlers.set(channel, handler) },
  dialog: {},
  shell: {},
}));

import { registerIpcHandlers } from '../src/main/ipc/registerIpcHandlers';

describe('IPC behavior', () => {
  let settings: typeof DEFAULT_SETTINGS;
  let queue: { on: ReturnType<typeof vi.fn>; cancelJob: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    electron.handlers.clear();
    vi.clearAllMocks();
    settings = { ...DEFAULT_SETTINGS };
    const settingsRepo = {
      getSettings: () => settings,
      updateSettings: (partial: Partial<typeof settings>) => {
        settings = { ...settings, ...partial };
        return settings;
      },
    };
    queue = { on: vi.fn(), cancelJob: vi.fn().mockReturnValue(true) };
    registerIpcHandlers(
      {} as any, settingsRepo as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, queue as any, {} as any, { on: vi.fn() } as any
    );
  });

  it('applies Windows startup and minimized preferences when saved from Settings', () => {
    const save = electron.handlers.get(IPC_CHANNELS.SETTINGS_UPDATE)!;
    save(null, { launchAtStartup: true, startMinimized: true });
    expect(electron.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: true, args: ['--minimized'] });
    save(null, { startMinimized: false });
    expect(electron.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: true, args: [] });
    save(null, { launchAtStartup: false });
    expect(electron.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: false, args: [] });
  });

  it('does not touch OS startup registration for unrelated settings', () => {
    electron.handlers.get(IPC_CHANNELS.SETTINGS_UPDATE)!(null, { repeatCount: 7 });
    expect(electron.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('cancels through queue ownership so waiting and running jobs update status', async () => {
    await electron.handlers.get(IPC_CHANNELS.VIDEO_CANCEL)!(null, 'job_1');
    expect(queue.cancelJob).toHaveBeenCalledWith('job_1');
  });
});
