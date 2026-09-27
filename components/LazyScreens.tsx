import React, { lazy, Suspense } from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * تحميل لوحة الإدارة والتقارير عند الحاجة فقط.
 *
 * كان الموقع يُبنى في ملف جافاسكربت واحد (823KB) فيه شاشة الموظف ومعها
 * لوحة الإدارة والتقارير ومكتبة Excel — والموظف لا يستعمل منها شيئاً،
 * لكن هاتفه ينزّلها ويقرؤها عند كل فتح. بفصلها صار الملف الرئيسي 285KB.
 *
 * ⚠️ أي استيراد مباشر متبقٍّ لـ AdminDashboard أو ReportsView في App.tsx
 * أو Login.tsx يعيدهما — ومعهما مكتبة Excel — إلى الملف الرئيسي.
 * الاستيراد يجب أن يمرّ من هذا الملف وحده.
 */

/**
 * إعادة تحميل الصفحة مرة واحدة عند فشل تنزيل ملف شاشة.
 *
 * الحالة الأشيع: نسخة قديمة مفتوحة بعد نشر جديد، فتطلب ملفاً بصمته القديمة
 * لم تعد موجودة على الخادم (404). إعادة التحميل تجلب الأسماء الجديدة.
 * العلامة في sessionStorage تمنع حلقة إعادة تحميل لا تنتهي إن كان السبب
 * انقطاع الإنترنت لا نسخة قديمة.
 */
const RELOAD_FLAG = 'uniteam_chunk_reload';

const reloadApp = () => {
  const b = (window as any).AndroidBridge;
  // داخل التطبيق: الجسر يحمّل رابط التطبيق الأصلي في نفس الـ WebView
  if (b && typeof b.reloadApp === 'function' && b.canReloadApp && b.canReloadApp()) {
    try { b.reloadApp(); return; } catch (e) { /* نكمل بالطريقة العادية */ }
  }
  window.location.reload();
};

const lazyWithReload = <T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) =>
  lazy(async () => {
    try {
      const mod = await factory();
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch (e) { /* التخزين محجوب */ }
      return mod;
    } catch (err) {
      let alreadyTried = true;
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === '1';
        if (!alreadyTried && navigator.onLine) sessionStorage.setItem(RELOAD_FLAG, '1');
      } catch (e) { /* بلا تخزين لا نخاطر بحلقة — نعرض الخطأ مباشرة */ }

      if (!alreadyTried && navigator.onLine) {
        reloadApp();
        // وعد لا يُحسم: الصفحة ستُعاد تحميلها، فلا داعي لعرض الخطأ لحظياً
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });

export const LazyAdminDashboard = lazyWithReload(() => import('./AdminDashboard'));
export const LazyReportsView = lazyWithReload(() => import('./ReportsView'));

/* ---------- حاجز الأخطاء ---------- */

interface BoundaryState { failed: boolean }

class ScreenErrorBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('Screen failed to load:', error);
  }

  handleRetry = () => {
    try { sessionStorage.removeItem(RELOAD_FLAG); } catch (e) { /* التخزين محجوب */ }
    reloadApp();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="bg-slate-800 rounded-3xl border border-slate-700 p-8 text-center text-white max-w-md mx-auto">
        <AlertTriangle size={36} className="mx-auto text-amber-400 mb-4" />
        <h3 className="text-lg font-black mb-2">تعذّر تحميل هذه الشاشة</h3>
        <p className="text-sm text-slate-400 leading-relaxed mb-6">
          {navigator.onLine
            ? 'حدث خطأ أثناء تنزيل الشاشة. أعد التحميل للمحاولة مجدداً.'
            : 'لا يوجد اتصال بالإنترنت. تحقق من الشبكة ثم أعد التحميل.'}
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="ut-btn ut-btn--brand mx-auto"
          style={{ minHeight: 44, paddingInline: 20 }}
        >
          <RefreshCw size={16} /> إعادة التحميل
        </button>
      </div>
    );
  }
}

/* ---------- الغلاف ---------- */

const LoadingScreen: React.FC = () => (
  <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
    <Loader2 size={28} className="animate-spin text-blue-400" />
    <span className="text-sm font-bold">جارٍ تحميل الشاشة…</span>
  </div>
);

export const ScreenLoader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ScreenErrorBoundary>
    <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
  </ScreenErrorBoundary>
);
