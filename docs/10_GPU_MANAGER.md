# Phase 10: GPU Manager

## Status
PENDING

## Objective
Detect system GPU hardware (NVIDIA NVENC, Intel QSV, AMD AMF) and dynamically configure optimal hardware acceleration settings for FFmpeg.

## Scope
- Hardware GPU detection routines (`wmic` / `dxdiag` / FFmpeg encoder queries).
- Codec capabilities detection (`h264_nvenc`, `hevc_nvenc`, `h264_qsv`, `hevc_qsv`, `h264_amf`, `hevc_amf`).
- Automatic fallback strategy to CPU (`libx264`, `libx265`) if hardware encoding fails or is unsupported.

## Required Files
- `src/main/services/gpu/GpuManager.ts`
- `src/main/services/gpu/EncoderSelector.ts`

## Implementation Decisions
- System GPU capability detection runs on app launch and stores detected capabilities in application settings.
- User can toggle between Auto (GPU preferred), Explicit GPU (NVENC/QSV/AMF), or Software CPU.

## Validation
- GPU detection correctly identifies installed graphics hardware on Windows.
- Transcoding tests confirm GPU hardware utilization during rendering.

## Completion Criteria
- GPU detection and encoding pipeline functioning with seamless fallback to CPU encoding.
