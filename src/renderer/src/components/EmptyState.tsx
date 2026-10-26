import React, { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-card border border-border bg-surface/50 my-2">
      <div className="p-4 bg-surface-raised text-text-muted rounded-full mb-3">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-text-main">{title}</h3>
      <p className="text-xs text-text-muted max-w-sm mt-1 mb-4">{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary text-xs">
          {actionLabel}
        </button>
      )}
    </div>
  );
};
