import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { MediaInfo, VideoStreamInfo, AudioStreamInfo } from '@shared/types';
import { AppError } from '@shared/errors';
import { FFmpegManager } from './FFmpegManager';

export class FFprobeService {
  constructor(private ffmpegManager: FFmpegManager) {}

  public async probeMedia(filePath: string): Promise<MediaInfo> {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new AppError('INVALID_INPUT', `Tệp video nguồn không tồn tại: ${filePath}`);
    }

    // Resolves absolute ffprobePath or throws FFPROBE_MISSING
    const ffprobePath = await this.ffmpegManager.getFFprobePath();

    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath,
      ];

      execFile(
        ffprobePath,
        args,
        { maxBuffer: 10 * 1024 * 1024, windowsHide: true, shell: false },
        (err, stdout, stderr) => {
          if (err) {
            if ((err as any).code === 'ENOENT') {
              return reject(
                new AppError(
                  'FFPROBE_MISSING',
                  'Không tìm thấy FFprobe. Hãy cài đặt FFmpeg hoặc chọn đúng thư mục chứa ffmpeg.exe và ffprobe.exe trong phần Cài đặt.'
                )
              );
            }
            return reject(
              new AppError(
                'FFPROBE_FAILED',
                `Không thể phân tích định dạng tệp video: ${stderr || err.message}`
              )
            );
          }

          try {
            const rawData = JSON.parse(stdout);
            const format = rawData.format || {};
            const streams = rawData.streams || [];

            const videoStreams: VideoStreamInfo[] = [];
            const audioStreams: AudioStreamInfo[] = [];

            for (const s of streams) {
              if (s.codec_type === 'video') {
                let fps = 0;
                if (s.r_frame_rate) {
                  const parts = s.r_frame_rate.split('/');
                  if (parts.length === 2 && parseFloat(parts[1]) > 0) {
                    fps = parseFloat(parts[0]) / parseFloat(parts[1]);
                  }
                }
                videoStreams.push({
                  index: s.index,
                  codecName: s.codec_name || 'unknown',
                  codecLongName: s.codec_long_name || '',
                  width: s.width || 0,
                  height: s.height || 0,
                  fps: Math.round(fps * 100) / 100,
                  bitrate: parseInt(s.bit_rate || '0', 10),
                  duration: parseFloat(s.duration || format.duration || '0'),
                  pixFmt: s.pix_fmt || '',
                  aspectRatio: s.display_aspect_ratio || `${s.width}:${s.height}`,
                });
              } else if (s.codec_type === 'audio') {
                audioStreams.push({
                  index: s.index,
                  codecName: s.codec_name || 'unknown',
                  codecLongName: s.codec_long_name || '',
                  channels: s.channels || 0,
                  sampleRate: parseInt(s.sample_rate || '0', 10),
                  bitrate: parseInt(s.bit_rate || '0', 10),
                  duration: parseFloat(s.duration || format.duration || '0'),
                });
              }
            }

            if (videoStreams.length === 0) {
              return reject(
                new AppError(
                  'UNSUPPORTED_MEDIA',
                  'Không tìm thấy luồng video hợp lệ trong tệp đã chọn.'
                )
              );
            }

            const mediaInfo: MediaInfo = {
              filePath,
              fileName: path.basename(filePath),
              fileSize: fs.statSync(filePath).size,
              duration: parseFloat(format.duration || '0'),
              formatName: format.format_name || '',
              bitrate: parseInt(format.bit_rate || '0', 10),
              videoStreams,
              audioStreams,
              hasAudio: audioStreams.length > 0,
            };

            resolve(mediaInfo);
          } catch (e: any) {
            reject(
              new AppError(
                'UNSUPPORTED_MEDIA',
                `Lỗi khi phân tích dữ liệu metadata: ${e.message}`
              )
            );
          }
        }
      );
    });
  }
}
