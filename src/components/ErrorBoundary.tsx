import React from 'react';
import {AlertTriangle, RefreshCw} from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'حدث خطأ غير متوقع',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[Hatly ErrorBoundary] Caught runtime error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({hasError: false, errorMessage: null});
    this.props.onReset?.();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-[260px] flex items-center justify-center p-6 bg-[#F6F8FB]"
        >
          <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 p-6 text-center space-y-4 shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-extrabold text-[#0A192F]">
              {this.props.fallbackTitle || 'تعذر عرض هذه الشاشة'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              حدث خطأ غير متوقع أثناء تحميل البيانات. يمكنك المحاولة مرة أخرى أو تحديث الصفحة.
            </p>
            {this.state.errorMessage && (
              <p
                dir="ltr"
                className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-500 font-mono break-words"
              >
                {this.state.errorMessage}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF7B00] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[#E56E00] cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>إعادة المحاولة</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-[#0A192F] hover:bg-slate-50 cursor-pointer"
              >
                تحديث الصفحة
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
