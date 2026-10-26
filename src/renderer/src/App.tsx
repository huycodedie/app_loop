import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, TabType } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { MetricsDisplay } from './components/MetricsDisplay';
import { DashboardPage } from './pages/DashboardPage';
import { VideoProcessingPage } from './pages/VideoProcessingPage';
import { QueuePage } from './pages/QueuePage';
import { WatchFolderPage } from './pages/WatchFolderPage';
import { SchedulerPage } from './pages/SchedulerPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { JobRecord, HistoryRecord, PerformanceMetrics, GpuCapabilities } from '@shared/types';
import { ProcessingProgress } from '@shared/types/progress';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  const [queue, setQueue] = useState<JobRecord[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [gpuCaps, setGpuCaps] = useState<GpuCapabilities | null>(null);
  const [ffmpegStatus, setFfmpegStatus] = useState<{ installed: boolean; version: string }>({
    installed: false,
    version: '',
  });

  /**
   * Live progress snapshots keyed by jobId.
   * Updated on every processing:progress IPC event.
   * Cleared 3 seconds after a job completes to allow UI to show 100% briefly.
   */
  const [progressByJobId, setProgressByJobId] = useState<Record<string, ProcessingProgress>>({});

  const refreshData = async () => {
    try {
      if (!window.api) return;
      const q = await window.api.getQueue();
      setQueue(q || []);
      const h = await window.api.getHistory();
      setHistory(h || []);
      const ff = await window.api.getFFmpegStatus();
      setFfmpegStatus({ installed: ff?.installed || false, version: ff?.version || '' });
      const gpu = await window.api.detectGpuCapabilities();
      setGpuCaps(gpu || null);
    } catch (e) {
      console.error('Failed to fetch state via IPC:', e);
    }
  };

  /**
   * Handle an incoming progress event from Main process.
   * Uses functional updater to avoid stale closure bugs.
   */
  const handleProgress = useCallback((data: ProcessingProgress) => {
    if (!data?.jobId) return;

    setProgressByJobId((prev) => ({
      ...prev,
      [data.jobId]: data,
    }));

    // When job reaches 100%, schedule cleanup after 3 seconds
    if (data.overallProgress >= 100) {
      setTimeout(() => {
        setProgressByJobId((prev) => {
          const next = { ...prev };
          delete next[data.jobId];
          return next;
        });
      }, 3000);
    }
  }, []);

  useEffect(() => {
    refreshData();

    if (!window.api) return;

    // ─── THE CRITICAL FIX: subscribe to onProgress ────────────────
    const unsubProgress = window.api.onProgress?.(handleProgress);

    const unsubQueue = window.api.onQueueUpdated?.((newQueue) => {
      setQueue(newQueue);
    });

    const unsubPerf = window.api.onPerformanceUpdated?.((newMetrics) => {
      setMetrics(newMetrics);
    });

    return () => {
      if (typeof unsubProgress === 'function') unsubProgress();
      if (typeof unsubQueue === 'function') unsubQueue();
      if (typeof unsubPerf === 'function') unsubPerf();
    };
  }, [handleProgress]);

  useEffect(() => {
    if (activeTab !== 'dashboard' || !window.api) return;
    let active = true;
    window.api.getHistory().then((records) => {
      if (active) setHistory(records || []);
    }).catch((error) => console.error('Failed to refresh processing history:', error));
    return () => { active = false; };
  }, [activeTab, queue]);

  const pageTitleMap: Record<TabType, string> = {
    dashboard: 'Bảng điều khiển tổng quan',
    processing: 'Xử lý video',
    queue: 'Hàng chờ xử lý',
    watcher: 'Thư mục theo dõi tự động',
    scheduler: 'Lịch trình tự động',
    history: 'Lịch sử xử lý',
    settings: 'Cài đặt ứng dụng',
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app text-text-main">
      {/* Collapsible Left Sidebar Shell */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        queueCount={queue.length}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Right Main Application Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TopHeader
          pageTitle={pageTitleMap[activeTab]}
          ffmpegInstalled={ffmpegStatus.installed}
          ffmpegVersion={ffmpegStatus.version}
          gpuCaps={gpuCaps}
        />

        {/* Scrollable Page Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col gap-6">
          {activeTab === 'dashboard' && (
            <DashboardPage
              queue={queue}
              history={history}
              gpuCaps={gpuCaps}
              ffmpegInstalled={ffmpegStatus.installed}
              ffmpegVersion={ffmpegStatus.version}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'processing' && (
            <VideoProcessingPage
              gpuCaps={gpuCaps}
              onNavigateToQueue={() => setActiveTab('queue')}
            />
          )}
          {activeTab === 'queue' && (
            <QueuePage
              queue={queue}
              progressByJobId={progressByJobId}
              onPause={() => window.api?.pauseQueue()}
              onResume={() => window.api?.resumeQueue()}
              onRemove={(id) => window.api?.removeJobFromQueue(id)}
              onRetry={(id) => window.api?.retryJob(id)}
              onClearCompleted={() => window.api?.clearCompletedJobs()}
              onNavigateToProcessing={() => setActiveTab('processing')}
            />
          )}
          {activeTab === 'watcher' && <WatchFolderPage />}
          {activeTab === 'scheduler' && <SchedulerPage />}
          {activeTab === 'history' && <HistoryPage />}
          {activeTab === 'settings' && <SettingsPage />}

          {/* Real-time System Metrics Bar */}
          <MetricsDisplay metrics={metrics} />
        </main>
      </div>
    </div>
  );
};
