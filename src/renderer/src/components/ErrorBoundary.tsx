import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Renderer Error Boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-100 p-8">
          <div className="glass-card p-8 max-w-xl w-full flex flex-col gap-4 border-rose-500/30">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle size={28} />
              <h1 className="text-lg font-bold">Lỗi Ứng Dụng React</h1>
            </div>
            <p className="text-xs text-slate-400">
              Đã xảy ra lỗi không mong muốn trong giao diện ứng dụng.
            </p>
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs font-mono text-rose-300 overflow-auto max-h-48">
              {this.state.error?.toString() || 'Lỗi Không Xác Định'}
              {this.state.errorInfo?.componentStack && (
                <div className="text-[10px] text-slate-500 mt-2">
                  {this.state.errorInfo.componentStack}
                </div>
              )}
            </div>
            <button onClick={this.handleReload} className="btn-primary text-xs w-max mt-2">
              <RotateCcw size={14} /> Tải Lại Ứng Dụng
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
