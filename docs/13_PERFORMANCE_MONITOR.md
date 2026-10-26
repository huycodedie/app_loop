# Performance Monitor Documentation - Video Repeat Studio

## 1. Overview
`PerformanceMonitor` tracks system CPU usage, RAM allocation, free disk space, and job execution telemetry in real-time.

## 2. Telemetry Metrics
- **CPU Usage**: System-wide CPU usage percentage.
- **RAM Usage**: Memory allocated to Video Repeat Studio processes.
- **Disk Free**: Remaining storage in gigabytes on output target drive.
- **Job Stage**: Current step in processing pipeline (`ANALYZING`, `SPLITTING_INTRO`, `SPLITTING_REPEAT`, `CONCATENATING`, `VERIFYING`, `CLEANING`).

## 3. Event Propagation
Metrics are emitted periodically over IPC:
- Event channel: `performance:updated`
- Target component: `MetricsDisplay.tsx` in application shell footer.
