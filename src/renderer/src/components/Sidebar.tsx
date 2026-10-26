import React from 'react';
import {
  LayoutDashboard,
  Clapperboard,
  ListVideo,
  FolderSearch,
  CalendarClock,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export type TabType =
  | 'dashboard'
  | 'processing'
  | 'queue'
  | 'watcher'
  | 'scheduler'
  | 'history'
  | 'settings';

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  queueCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  queueCount,
  isCollapsed,
  onToggleCollapse,
}) => {
  const mainNavItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'processing', label: 'Xử lý video', icon: Clapperboard },
    { id: 'queue', label: 'Hàng chờ', icon: ListVideo, badge: queueCount },
    { id: 'watcher', label: 'Thư mục theo dõi', icon: FolderSearch },
    { id: 'scheduler', label: 'Lịch trình', icon: CalendarClock },
    { id: 'history', label: 'Lịch sử', icon: History },
  ];

  return (
    <aside
      className={`h-full bg-sidebar border-r border-border flex flex-col justify-between transition-all duration-200 z-20 select-none ${
        isCollapsed ? 'w-[72px]' : 'w-[240px]'
      }`}
    >
      {/* Top Logo & App Header */}
      <div>
        <div className="h-16 px-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-white shadow-md text-xs shrink-0">
              VRS
            </div>
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <span className="font-bold text-text-main text-xs tracking-wider uppercase truncate">
                  Video Repeat
                </span>
                <span className="text-[10px] text-primary font-mono tracking-widest uppercase">
                  Studio Pro
                </span>
              </div>
            )}
          </div>

          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-text-muted hover:text-text-main hover:bg-surface-raised rounded-control transition-colors"
            title={isCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Main Navigation Items */}
        <nav className="p-3 flex flex-col gap-1">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id as TabType)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-control text-sm font-medium transition-colors relative ${
                  isActive
                    ? 'bg-primary/15 text-primary border border-primary/30'
                    : 'text-text-secondary hover:text-text-main hover:bg-surface-raised/70'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
              >
                <Icon size={18} className={isActive ? 'text-primary' : 'text-text-muted'} />
                {!isCollapsed && <span className="truncate flex-1 text-left">{item.label}</span>}

                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`px-2 py-0.5 text-xs bg-primary/20 text-primary rounded-full font-mono font-bold ${
                      isCollapsed ? 'absolute -top-1 -right-1 text-[10px] px-1.5 py-0' : ''
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Settings Navigation */}
      <div className="p-3 border-t border-border flex flex-col gap-2">
        <button
          onClick={() => onSelectTab('settings')}
          title={isCollapsed ? 'Cài đặt' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-control text-sm font-medium transition-colors ${
            activeTab === 'settings'
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'text-text-secondary hover:text-text-main hover:bg-surface-raised/70'
          } ${isCollapsed ? 'justify-center px-0' : ''}`}
        >
          <Settings size={18} className={activeTab === 'settings' ? 'text-primary' : 'text-text-muted'} />
          {!isCollapsed && <span className="truncate flex-1 text-left">Cài đặt</span>}
        </button>

        {!isCollapsed && (
          <div className="text-[11px] text-text-muted text-center py-1 font-mono">
            v1.0.0 • Windows x64
          </div>
        )}
      </div>
    </aside>
  );
};
