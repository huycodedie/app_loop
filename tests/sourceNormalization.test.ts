import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaInfo } from '../src/shared/types';
import { AppError } from '../src/shared/errors';

/**
 * Pure strategy selector mirroring VideoEngine.ts production logic.
 */
function determineNormalizationStrategy(
  mediaInfo: MediaInfo,
  requestedEncoder: string
): {
  strategyName: 'A_FULL_COPY' | 'B_AUDIO_ONLY' | 'C_NVENC' | 'D_CPU';
  targetEncoder: string;
  videoCodecArg: string;
  audioCodecArgs: string[];
} {
  // Pre-validation
  if (!mediaInfo.videoStreams || mediaInfo.videoStreams.length === 0 || mediaInfo.duration <= 0) {
    throw new AppError('UNSUPPORTED_MEDIA', 'File không có luồng video hợp lệ');
  }

  const vStream = mediaInfo.videoStreams[0];
  if (!vStream || vStream.width <= 0 || vStream.height <= 0) {
    throw new AppError('UNSUPPORTED_MEDIA', 'File không có luồng video hợp lệ');
  }

  const aStream = mediaInfo.hasAudio && mediaInfo.audioStreams.length > 0 ? mediaInfo.audioStreams[0] : null;

  const videoCodec = (vStream.codecName || '').toLowerCase();
  const pixFmt = (vStream.pixFmt || '').toLowerCase();
  const isVideoCompatible =
    ['h264', 'hevc', 'h265'].includes(videoCodec) &&
    pixFmt === 'yuv420p' &&
    vStream.width > 0 &&
    vStream.height > 0;

  const audioCodec = aStream ? (aStream.codecName || '').toLowerCase() : '';
  const isAudioCompatible =
    !mediaInfo.hasAudio ||
    (audioCodec === 'aac' && (aStream?.sampleRate === 44100 || aStream?.sampleRate === 48000));

  if (isVideoCompatible && isAudioCompatible) {
    return {
      strategyName: 'A_FULL_COPY',
      targetEncoder: 'copy',
      videoCodecArg: 'copy',
      audioCodecArgs: mediaInfo.hasAudio ? ['-c:a', 'copy'] : ['-an'],
    };
  } else if (isVideoCompatible && !isAudioCompatible) {
    return {
      strategyName: 'B_AUDIO_ONLY',
      targetEncoder: 'copy',
      videoCodecArg: 'copy',
      audioCodecArgs: ['-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2'],
    };
  } else if (requestedEncoder === 'h264_nvenc' || requestedEncoder === 'hevc_nvenc') {
    return {
      strategyName: 'C_NVENC',
      targetEncoder: requestedEncoder,
      videoCodecArg: requestedEncoder,
      audioCodecArgs: mediaInfo.hasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2'] : ['-an'],
    };
  } else {
    return {
      strategyName: 'D_CPU',
      targetEncoder: requestedEncoder === 'copy' ? 'libx264' : requestedEncoder,
      videoCodecArg: requestedEncoder === 'copy' ? 'libx264' : requestedEncoder,
      audioCodecArgs: mediaInfo.hasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2'] : ['-an'],
    };
  }
}

describe('FFmpeg Source Normalization Pipeline Unit Tests', () => {

  describe('1. Pre-Validation Check', () => {
    it('should throw "File không có luồng video hợp lệ" when videoStreams is empty', () => {
      const invalidMedia: MediaInfo = {
        filePath: 'test.mp4',
        fileName: 'test.mp4',
        fileSize: 1024,
        duration: 10,
        formatName: 'mov,mp4',
        bitrate: 1000,
        videoStreams: [],
        audioStreams: [],
        hasAudio: false,
      };

      expect(() => determineNormalizationStrategy(invalidMedia, 'libx264')).toThrowError('File không có luồng video hợp lệ');
    });

    it('should throw "File không có luồng video hợp lệ" when duration is 0', () => {
      const invalidMedia: MediaInfo = {
        filePath: 'corrupt.mp4',
        fileName: 'corrupt.mp4',
        fileSize: 0,
        duration: 0,
        formatName: 'mp4',
        bitrate: 0,
        videoStreams: [{
          index: 0, codecName: 'h264', codecLongName: 'H.264', width: 1920, height: 1080, fps: 30, bitrate: 5000, duration: 0, pixFmt: 'yuv420p', aspectRatio: '16:9'
        }],
        audioStreams: [],
        hasAudio: false,
      };

      expect(() => determineNormalizationStrategy(invalidMedia, 'libx264')).toThrowError('File không có luồng video hợp lệ');
    });
  });

  describe('2. Stream Strategy Selection (A, B, C, D)', () => {
    it('Strategy A: Full Copy when source video is H.264 yuv420p and audio is AAC 44.1kHz', () => {
      const media: MediaInfo = {
        filePath: 'compatible.mp4',
        fileName: 'compatible.mp4',
        fileSize: 5000000,
        duration: 120,
        formatName: 'mov,mp4',
        bitrate: 2000,
        videoStreams: [{
          index: 0, codecName: 'h264', codecLongName: 'H.264', width: 1920, height: 1080, fps: 30, bitrate: 4000, duration: 120, pixFmt: 'yuv420p', aspectRatio: '16:9'
        }],
        audioStreams: [{
          index: 1, codecName: 'aac', codecLongName: 'AAC', channels: 2, sampleRate: 44100, bitrate: 192000, duration: 120
        }],
        hasAudio: true,
      };

      const res = determineNormalizationStrategy(media, 'h264_nvenc');
      expect(res.strategyName).toBe('A_FULL_COPY');
      expect(res.videoCodecArg).toBe('copy');
      expect(res.audioCodecArgs).toEqual(['-c:a', 'copy']);
    });

    it('Strategy B: Audio Only Correction when source video is H.264 yuv420p but audio is MP3', () => {
      const media: MediaInfo = {
        filePath: 'mp3_audio.mp4',
        fileName: 'mp3_audio.mp4',
        fileSize: 5000000,
        duration: 60,
        formatName: 'mp4',
        bitrate: 2000,
        videoStreams: [{
          index: 0, codecName: 'h264', codecLongName: 'H.264', width: 1280, height: 720, fps: 30, bitrate: 2000, duration: 60, pixFmt: 'yuv420p', aspectRatio: '16:9'
        }],
        audioStreams: [{
          index: 1, codecName: 'mp3', codecLongName: 'MPEG Audio Layer 3', channels: 2, sampleRate: 44100, bitrate: 128000, duration: 60
        }],
        hasAudio: true,
      };

      const res = determineNormalizationStrategy(media, 'libx264');
      expect(res.strategyName).toBe('B_AUDIO_ONLY');
      expect(res.videoCodecArg).toBe('copy');
      expect(res.audioCodecArgs).toEqual(['-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2']);
    });

    it('Strategy C: NVENC Video Normalization when video is non-yuv420p (yuv422p)', () => {
      const media: MediaInfo = {
        filePath: 'prores.mov',
        fileName: 'prores.mov',
        fileSize: 50000000,
        duration: 30,
        formatName: 'mov',
        bitrate: 10000,
        videoStreams: [{
          index: 0, codecName: 'prores', codecLongName: 'Apple ProRes', width: 1920, height: 1080, fps: 24, bitrate: 10000, duration: 30, pixFmt: 'yuv422p10le', aspectRatio: '16:9'
        }],
        audioStreams: [{
          index: 1, codecName: 'pcm_s16le', codecLongName: 'PCM', channels: 2, sampleRate: 48000, bitrate: 1536000, duration: 30
        }],
        hasAudio: true,
      };

      const res = determineNormalizationStrategy(media, 'h264_nvenc');
      expect(res.strategyName).toBe('C_NVENC');
      expect(res.videoCodecArg).toBe('h264_nvenc');
    });

    it('Strategy D: CPU Normalization when GPU mode is CPU', () => {
      const media: MediaInfo = {
        filePath: 'vp9.webm',
        fileName: 'vp9.webm',
        fileSize: 10000000,
        duration: 45,
        formatName: 'matroska,webm',
        bitrate: 3000,
        videoStreams: [{
          index: 0, codecName: 'vp9', codecLongName: 'VP9', width: 1920, height: 1080, fps: 60, bitrate: 3000, duration: 45, pixFmt: 'yuv420p', aspectRatio: '16:9'
        }],
        audioStreams: [{
          index: 1, codecName: 'opus', codecLongName: 'Opus', channels: 2, sampleRate: 48000, bitrate: 128000, duration: 45
        }],
        hasAudio: true,
      };

      const res = determineNormalizationStrategy(media, 'libx264');
      expect(res.strategyName).toBe('D_CPU');
      expect(res.videoCodecArg).toBe('libx264');
    });
  });
});
