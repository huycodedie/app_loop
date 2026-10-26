import { execFile } from 'child_process';
import si from 'systeminformation';
import { GpuCapabilities, GpuEncoderCapability, EncoderType, GpuMode } from '@shared/types';
import { FFmpegManager } from '../ffmpeg/FFmpegManager';

export class GpuManager {
  private cachedCapabilities: GpuCapabilities | null = null;

  constructor(private ffmpegManager: FFmpegManager) {}

  public async detectCapabilities(): Promise<GpuCapabilities> {
    if (this.cachedCapabilities) return this.cachedCapabilities;

    let gpuName = 'Không khả dụng';
    let gpuVendor: 'NVIDIA' | 'AMD' | 'INTEL' | 'CPU' = 'CPU';

    try {
      const graphics = await si.graphics();
      if (graphics.controllers && graphics.controllers.length > 0) {
        // Filter out virtual/indirect display drivers like OrayIddDriver, DisplayLink, spacedesk
        const physicalGpus = graphics.controllers.filter((c) => {
          const name = ((c.model || '') + ' ' + (c.vendor || '')).toLowerCase();
          return (
            !name.includes('oray') &&
            !name.includes('virtual') &&
            !name.includes('indirect') &&
            !name.includes('displaylink') &&
            !name.includes('spacedesk') &&
            !name.includes('idddriver')
          );
        });

        const primaryGpu = physicalGpus[0] || graphics.controllers[0];
        const vendorLower = (primaryGpu.vendor || '').toLowerCase();
        const modelLower = (primaryGpu.model || '').toLowerCase();
        const fullName = `${primaryGpu.vendor || ''} ${primaryGpu.model || ''}`.trim();

        if (vendorLower.includes('nvidia') || modelLower.includes('nvidia') || modelLower.includes('geforce') || modelLower.includes('rtx') || modelLower.includes('gtx')) {
          gpuVendor = 'NVIDIA';
          gpuName = fullName || 'NVIDIA GPU';
        } else if (vendorLower.includes('amd') || vendorLower.includes('radeon') || modelLower.includes('amd') || modelLower.includes('radeon')) {
          gpuVendor = 'AMD';
          gpuName = fullName || 'AMD Radeon GPU';
        } else if (vendorLower.includes('intel') || modelLower.includes('intel') || modelLower.includes('iris') || modelLower.includes('uhd')) {
          gpuVendor = 'INTEL';
          gpuName = fullName || 'Intel Graphics';
        }
      }
    } catch {
      // Fallback
    }

    const availableEncoders = await this.queryFFmpegEncoders();

    let selectedEncoder: EncoderType = 'libx264';
    if (gpuVendor === 'NVIDIA' && availableEncoders.some((e) => e.encoder === 'h264_nvenc' && e.isAvailable)) {
      selectedEncoder = 'h264_nvenc';
    } else if (gpuVendor === 'INTEL' && availableEncoders.some((e) => e.encoder === 'h264_qsv' && e.isAvailable)) {
      selectedEncoder = 'h264_qsv';
    } else if (gpuVendor === 'AMD' && availableEncoders.some((e) => e.encoder === 'h264_amf' && e.isAvailable)) {
      selectedEncoder = 'h264_amf';
    } else {
      gpuVendor = 'CPU';
      gpuName = 'Không khả dụng';
      selectedEncoder = 'libx264';
    }

    this.cachedCapabilities = {
      gpuName,
      gpuVendor,
      availableEncoders,
      selectedEncoder,
    };

    return this.cachedCapabilities;
  }

  public async getEncoderForMode(mode: GpuMode, preferredEncoder?: EncoderType): Promise<EncoderType> {
    const caps = await this.detectCapabilities();

    if (mode === 'CPU') return 'libx264';

    if (preferredEncoder && caps.availableEncoders.some((e) => e.encoder === preferredEncoder && e.isAvailable)) {
      return preferredEncoder;
    }

    if (mode === 'AUTO') {
      return caps.selectedEncoder;
    }

    if (mode === 'NVIDIA') {
      const nvenc = caps.availableEncoders.find((e) => e.encoder === 'h264_nvenc' && e.isAvailable);
      return nvenc ? 'h264_nvenc' : 'libx264';
    }

    if (mode === 'INTEL') {
      const qsv = caps.availableEncoders.find((e) => e.encoder === 'h264_qsv' && e.isAvailable);
      return qsv ? 'h264_qsv' : 'libx264';
    }

    if (mode === 'AMD') {
      const amf = caps.availableEncoders.find((e) => e.encoder === 'h264_amf' && e.isAvailable);
      return amf ? 'h264_amf' : 'libx264';
    }

    return 'libx264';
  }

  private async queryFFmpegEncoders(): Promise<GpuEncoderCapability[]> {
    const capabilities: GpuEncoderCapability[] = [
      { encoder: 'h264_nvenc', name: 'NVIDIA NVENC H.264', vendor: 'NVIDIA', isAvailable: false },
      { encoder: 'hevc_nvenc', name: 'NVIDIA NVENC HEVC', vendor: 'NVIDIA', isAvailable: false },
      { encoder: 'h264_qsv', name: 'Intel QuickSync H.264', vendor: 'INTEL', isAvailable: false },
      { encoder: 'hevc_qsv', name: 'Intel QuickSync HEVC', vendor: 'INTEL', isAvailable: false },
      { encoder: 'h264_amf', name: 'AMD AMF H.264', vendor: 'AMD', isAvailable: false },
      { encoder: 'hevc_amf', name: 'AMD AMF HEVC', vendor: 'AMD', isAvailable: false },
      { encoder: 'libx264', name: 'CPU x264', vendor: 'CPU', isAvailable: true },
      { encoder: 'libx265', name: 'CPU x265', vendor: 'CPU', isAvailable: true },
    ];

    try {
      const ffmpegPath = await this.ffmpegManager.getFFmpegPath();

      return new Promise((resolve) => {
        execFile(ffmpegPath, ['-encoders'], (err, stdout) => {
          if (!err && stdout) {
            for (const cap of capabilities) {
              if (cap.vendor !== 'CPU') {
                cap.isAvailable = stdout.includes(cap.encoder);
              }
            }
          }
          resolve(capabilities);
        });
      });
    } catch {
      return capabilities;
    }
  }
}
