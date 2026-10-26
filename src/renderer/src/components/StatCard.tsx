import React, { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  description,
  variant = 'default',
}) => {
  const colorMap = {
    default: 'bg-surface text-text-main border-border',
    primary: 'bg-surface border-primary/40 text-primary',
    success: 'bg-surface border-success/40 text-success',
    warning: 'bg-surface border-warning/40 text-warning',
    danger: 'bg-surface border-danger/40 text-danger',
  };

  const iconBgMap = {
    default: 'bg-surface-raised text-text-secondary',
    primary: 'bg-primary/15 text-primary',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/15 text-danger',
  };

  return (
    <div className={`p-5 rounded-card border transition-all ${colorMap[variant]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {title}
        </span>
        <div className={`p-2.5 rounded-control ${iconBgMap[variant]}`}>{icon}</div>
      </div>
      <div className="mt-3 text-3xl font-bold font-mono tracking-tight text-text-main">
        {value}
      </div>
      {description && (
        <div className="mt-1 text-xs text-text-muted">{description}</div>
      )}
    </div>
  );
};
