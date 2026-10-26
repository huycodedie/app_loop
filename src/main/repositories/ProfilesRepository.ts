import { getDatabase } from '../database/db';
import { ProfileConfig, EncoderType, GpuMode } from '@shared/types';

export class ProfilesRepository {
  public getAllProfiles(): ProfileConfig[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all() as any[];
    return rows.map(this.mapRowToProfile);
  }

  public addProfile(profile: ProfileConfig): ProfileConfig {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO profiles (
        id, name, encoder, gpu_mode, preset, crf, output_folder, container,
        audio_bitrate, filename_template, default_repeat_count, audio_fade_in_enabled,
        default_audio_fade_in_duration, duration_limit_enabled, default_duration_limit_seconds,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      profile.name,
      profile.encoder,
      profile.gpuMode,
      profile.preset,
      profile.crf,
      profile.outputFolder,
      profile.container,
      profile.audioBitrate,
      profile.filenameTemplate,
      profile.defaultRepeatCount ?? 3,
      profile.audioFadeInEnabled ? 1 : 0,
      profile.defaultAudioFadeInDuration ?? 5.0,
      profile.durationLimitEnabled ? 1 : 0,
      profile.defaultDurationLimitSeconds ?? 10800,
      profile.createdAt
    );
    return profile;
  }

  public deleteProfile(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
  }

  private mapRowToProfile(row: any): ProfileConfig {
    return {
      id: row.id,
      name: row.name,
      encoder: row.encoder as EncoderType,
      gpuMode: row.gpu_mode as GpuMode,
      preset: row.preset,
      crf: row.crf,
      outputFolder: row.output_folder,
      container: row.container,
      audioBitrate: row.audio_bitrate,
      filenameTemplate: row.filename_template,
      defaultRepeatCount: row.default_repeat_count ?? 3,
      audioFadeInEnabled: Boolean(row.audio_fade_in_enabled ?? 1),
      defaultAudioFadeInDuration: row.default_audio_fade_in_duration ?? 5.0,
      durationLimitEnabled: Boolean(row.duration_limit_enabled ?? 0),
      defaultDurationLimitSeconds: row.default_duration_limit_seconds ?? 10800,
      createdAt: row.created_at,
    };
  }
}
