import { getDatabase } from '../database/db';
import { AppSettings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';

export class SettingsRepository {
  public getSettings(): AppSettings {
    const db = getDatabase();
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;

    const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    return settings as unknown as AppSettings;
  }

  public updateSettings(partialSettings: Partial<AppSettings>): AppSettings {
    const db = getDatabase();
    const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

    db.transaction(() => {
      for (const [key, value] of Object.entries(partialSettings)) {
        if (value !== undefined) {
          stmt.run(key, JSON.stringify(value));
        }
      }
    })();

    return this.getSettings();
  }
}
