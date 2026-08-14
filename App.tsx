
import React, { useState, useEffect, useCallback } from 'react';
import { User, Branch, AttendanceRecord, AppConfig, Job, ReportAccount, VisitPlan } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import ReportsView from './components/ReportsView';
import { ShieldCheck, User as UserIcon, Cloud, CloudOff, RefreshCw, FileSpreadsheet, Home, Download, Share, PlusSquare, X, Wifi, LogOut, ShieldAlert, AlertTriangle, Smartphone, Settings } from 'lucide-react';
import { syncTimeWithServer, checkDeveloperOptionsStatus, getDeviceFingerprint } from './utils';
import { LogoMark } from './components/Logo';

// ==========================================
// المصدر الرئيسي الوحيد لكلمة مرور المسؤول (Admin Password)
// يمكنك تغييرها هنا مباشرة وسيتم تحديثها تلقائياً في كل التطبيق
const ADMIN_PASSWORD_SSOT = 'Ba522129';
// ==========================================

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reportAccounts, setReportAccounts] = useState<ReportAccount[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [visitPlans, setVisitPlans] = useState<VisitPlan[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeView, setActiveView] = useState<'main' | 'reports'>('main');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  
  // iOS Installation States
  const [isIos, setIsIos] = useState(false);
  const [isInStandaloneMode, setIsInStandaloneMode] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  // Developer Options Security Detection
  const [developerModeStatus, setDeveloperModeStatus] = useState<{ enabled: boolean; source: string }>({ enabled: false, source: '' });

  // مفتاح الصيانة: يُقرأ من server-config.json ليمكن إيقاف التطبيق
  // عن الموظفين أثناء التحديث دون إيقاف نشر الموقع
  const [maintenance, setMaintenance] = useState<{ active: boolean; title: string; message: string }>({
    active: false,
    title: 'التطبيق تحت الصيانة',
    message: 'يجري تحديث النظام حالياً. حاول مرة أخرى بعد قليل.'
  });

  useEffect(() => {
    const checkDevMode = () => {
      const status = checkDeveloperOptionsStatus();
      setDeveloperModeStatus(status);
    };
    checkDevMode();
    const interval = setInterval(checkDevMode, 3000);
    return () => clearInterval(interval);
  }, []);

  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem('attendance_config');
    const defaultConfig = { 
      googleSheetLink: '',
      syncUrl: '',
      auditLogUrl: '',
      adminUsername: 'admin',
      adminPassword: ADMIN_PASSWORD_SSOT
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Always force adminPassword to be the ADMIN_PASSWORD_SSOT from the code, ignoring any saved password
        return { ...defaultConfig, ...parsed, adminPassword: ADMIN_PASSWORD_SSOT };
      } catch (e) {
        return defaultConfig;
      }
    }
    return defaultConfig;
  });

  useEffect(() => {
    // Android Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    });

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // Detect Standalone Mode (Installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsInStandaloneMode(isStandalone);
    
    // Online/Offline Status Listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          setInstallPrompt(null);
        }
      });
    } else if (isIos) {
      setShowIosInstructions(true);
    }
  };

  const syncWithCloud = useCallback(async (url: string, force: boolean = false) => {
    if (!url || !url.startsWith('http')) return;
    // Don't sync if offline
    if (!navigator.onLine) {
       setSyncError(true);
       return;
    }
    
    setIsSyncing(true);
    setSyncError(false);
    try {
      // مزامنة الوقت بالخلفية لضمان دقة ساعة التطبيق بالتوقيت المصري وحمايته من التلاعب
      syncTimeWithServer().catch(e => console.warn('Background time sync failed', e));

      const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}action=getData&t=${Date.now()}`;
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error('فشل الاتصال');
      const data = await response.json();
      
      if (data.branches) {
        setBranches(data.branches);
        localStorage.setItem('attendance_branches', JSON.stringify(data.branches));
      }
      if (data.jobs) {
        setJobs(data.jobs);
        localStorage.setItem('attendance_jobs', JSON.stringify(data.jobs));
      }
      if (data.reportAccounts) {
        setReportAccounts(data.reportAccounts);
        localStorage.setItem('attendance_report_accounts', JSON.stringify(data.reportAccounts));
      }
      if (data.users && Array.isArray(data.users)) {
        setAllUsers(data.users);
        localStorage.setItem('attendance_users', JSON.stringify(data.users));
        
        // Update current user if already logged in (using functional update to avoid stale closure)
        setCurrentUser(prev => {
          if (prev && prev.role !== 'admin') {
            const updatedUser = data.users.find((u: User) => u.id === prev.id);
            if (updatedUser) {
              localStorage.setItem('attendance_current_user', JSON.stringify(updatedUser));
              return updatedUser;
            }
          }
          return prev;
        });
      }
      if (data.visitPlans) {
        setVisitPlans(data.visitPlans);
        localStorage.setItem('attendance_visit_plans', JSON.stringify(data.visitPlans));
      }
      
      setConfig(prev => {
        const updatedConfig = { ...prev, lastUpdated: new Date().toISOString(), syncUrl: url, googleSheetLink: url };
        if (data.holidays) updatedConfig.holidays = data.holidays;
        const { adminPassword, ...configToSave } = updatedConfig;
        localStorage.setItem('attendance_config', JSON.stringify(configToSave));
        return updatedConfig;
      });
    } catch (err) {
      setSyncError(true);
      console.warn('Sync attempt failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, []); // No dependencies to avoid infinite loops

  // Initial Data Load
  useEffect(() => {
    // مزامنة الوقت فور تشغيل التطبيق
    syncTimeWithServer().catch(e => console.warn('On-load time sync failed', e));

    const savedUser = localStorage.getItem('attendance_current_user');
    const savedBranches = localStorage.getItem('attendance_branches');
    const savedJobs = localStorage.getItem('attendance_jobs');
    const savedPlans = localStorage.getItem('attendance_visit_plans');
    const savedUsers = localStorage.getItem('attendance_users');
    const savedReportAccounts = localStorage.getItem('attendance_report_accounts');
    
    if (savedUser) setCurrentUser(JSON.parse(savedUser));
    if (savedBranches) setBranches(JSON.parse(savedBranches));
    if (savedJobs) setJobs(JSON.parse(savedJobs));
    if (savedPlans) setVisitPlans(JSON.parse(savedPlans));
    if (savedUsers) setAllUsers(JSON.parse(savedUsers));
    if (savedReportAccounts) setReportAccounts(JSON.parse(savedReportAccounts));
    
    // Check URL params for cloud link
    const params = new URLSearchParams(window.location.search);
    const cloudUrlEncoded = params.get('c');
    let urlToSync = config.syncUrl;

    if (cloudUrlEncoded) {
      try {
        const decodedUrl = atob(cloudUrlEncoded);
        if (decodedUrl.startsWith('http')) {
          urlToSync = decodedUrl;
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {}
    }

    if (urlToSync) {
      syncWithCloud(urlToSync);
    }
  }, []);

  // Continuous Auto-Reconnect & Periodic Sync
  useEffect(() => {
     if (!config.syncUrl) return;

     // STOP Auto-Sync for Admin to allow local editing without overwrites
     if (currentUser?.role === 'admin') return;

     // 1. Sync immediately when coming back online
     if (isOnline) {
       syncWithCloud(config.syncUrl);
     }

     // 2. Poll every 2 seconds to keep data fresh if online (for non-admin users)
     const intervalId = setInterval(() => {
       if (navigator.onLine) {
         syncWithCloud(config.syncUrl);
       }
     }, 300000); // 2 seconds interval

     return () => clearInterval(intervalId);
  }, [isOnline, config.syncUrl, syncWithCloud, currentUser]);

  // Check for global updates from GitHub static file
  // تفعيل فوري لشاشة الصيانة حين تكتشفها شاشة الموظف لحظة الضغط على
  // حضور أو انصراف، دون انتظار دورة الفحص التالية
  useEffect(() => {
    const onMaintenance = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setMaintenance({
        active: true,
        title: detail.title || 'التطبيق تحت الصيانة',
        message: detail.message || 'يجري تحديث النظام حالياً. حاول مرة أخرى بعد قليل.'
      });
    };
    window.addEventListener('uniteam:maintenance', onMaintenance);
    return () => window.removeEventListener('uniteam:maintenance', onMaintenance);
  }, []);

  useEffect(() => {
    const checkForUpdates = async () => {
      if (!navigator.onLine) return;
      try {
        const res = await fetch('./server-config.json?t=' + Date.now());
        if (res.ok) {
          const data = await res.json();

          // مفتاح الصيانة يُقرأ قبل أي شيء آخر، فهو يحجب الواجهة كاملة
          setMaintenance({
            active: data && data.maintenance === true,
            title: (data && data.maintenanceTitle) || 'التطبيق تحت الصيانة',
            message: (data && data.maintenanceMessage) ||
                     'يجري تحديث النظام حالياً. حاول مرة أخرى بعد قليل.'
          });

          if (data && data.googleSheetLink && data.googleSheetLink.startsWith('http')) {
            const saved = localStorage.getItem('attendance_config');
            const currentConfig = saved ? JSON.parse(saved) : null;
            
            const hasChanges = !currentConfig || 
                              data.googleSheetLink !== currentConfig.syncUrl || 
                              (data.auditLogUrl !== undefined && data.auditLogUrl !== currentConfig.auditLogUrl);

            if (hasChanges) {
              setConfig(prev => {
                const updatedConfig = { 
                  ...prev, 
                  syncUrl: data.googleSheetLink, 
                  googleSheetLink: data.googleSheetLink,
                  auditLogUrl: data.auditLogUrl !== undefined ? data.auditLogUrl : prev.auditLogUrl
                };
                const { adminPassword, ...configToSave } = updatedConfig;
                localStorage.setItem('attendance_config', JSON.stringify(configToSave));
                return updatedConfig;
              });
              syncWithCloud(data.googleSheetLink);
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    };

    checkForUpdates();
    const interval = setInterval(checkForUpdates, 5 * 60000); // Check every 5 minutes
    return () => clearInterval(interval);
  }, [syncWithCloud]);

  useEffect(() => { localStorage.setItem('attendance_branches', JSON.stringify(branches)); }, [branches]);
  useEffect(() => { localStorage.setItem('attendance_jobs', JSON.stringify(jobs)); }, [jobs]);
  useEffect(() => { localStorage.setItem('attendance_visit_plans', JSON.stringify(visitPlans)); }, [visitPlans]);

  const logAction = useCallback(async (action: string, details: string = '') => {
    if (!config.syncUrl || !navigator.onLine) return;
    
    try {
      const payload = {
        action: 'logAudit',
        user: currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'Guest',
        auditAction: action,
        details: details,
        deviceInfo: navigator.userAgent,
        spreadsheetId: config.auditLogUrl || ''
      };
      
      await fetch(config.syncUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Audit Log Error:', e);
    }
  }, [config.syncUrl, config.auditLogUrl, currentUser]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('attendance_current_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    if (currentUser) {
      logAction('تسجيل خروج', `المستخدم: ${currentUser.fullName} (${currentUser.role})`);
    }
    localStorage.removeItem('attendance_current_user');
    setCurrentUser(null);
    setActiveView('main');
  };

  const handleUpdateConfig = (newCfg: Partial<AppConfig>) => {
    const cfg = { ...config, ...newCfg, adminPassword: ADMIN_PASSWORD_SSOT };
    setConfig(cfg);
    const { adminPassword, ...configToSave } = cfg;
    localStorage.setItem('attendance_config', JSON.stringify(configToSave));
  };

  // Determine if we should show an install button (Android or iOS web)
  const showInstallButton = !isInStandaloneMode && (installPrompt || isIos);

  // شاشة الصيانة تحجب الواجهة كاملة، وتُفعَّل بتغيير حقل واحد
  // في server-config.json دون الحاجة لإيقاف نشر الموقع
  if (maintenance.active) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-slate-900 relative z-10">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-slate-800 border border-slate-700 mb-7">
            <Settings size={44} className="text-amber-500 animate-spin" style={{ animationDuration: '4s' }} />
          </div>

          <h1 className="text-xl font-black text-slate-100 mb-3">{maintenance.title}</h1>
          <p className="text-slate-400 text-sm leading-loose mb-8">{maintenance.message}</p>

          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-colors"
          >
            إعادة المحاولة
          </button>

          <div className="mt-6 text-xs text-slate-500 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>سيعود التطبيق تلقائياً عند انتهاء الصيانة</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <header className="ut-header sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between relative">
          <div className="flex items-center gap-3">
            <LogoMark size={38} />
            <div className="leading-none">
              <div className="flex items-center gap-2">
                <h1 className="ut-brand" style={{ fontSize: 19 }}>Uniteam</h1>
                {isSyncing ? (
                  <span className="ut-chip ut-chip--brand">
                    <RefreshCw size={11} className="animate-spin" /> مزامنة
                  </span>
                ) : isOnline && config.syncUrl ? (
                  currentUser?.role === 'admin' ? (
                    <span className="ut-chip ut-chip--warn">مزامنة يدوية</span>
                  ) : (
                    <span className="ut-chip ut-chip--ok">
                      <span className="ut-pulse" /> متصل
                    </span>
                  )
                ) : (
                  <span className="ut-chip ut-chip--bad">
                    <CloudOff size={11} /> غير متصل
                  </span>
                )}
              </div>
              <p className="ut-header__sub text-[11px] mt-1">
                {currentUser ? currentUser.fullName : 'نظام الحضور والانصراف'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {config.syncUrl && (
              <button
                onClick={() => {
                  if (config.syncUrl) syncWithCloud(config.syncUrl, true);
                  logAction('تحديث البيانات', 'مزامنة يدوية من الهيدر');
                }}
                disabled={isSyncing}
                title="تحديث البيانات"
                className="ut-btn ut-btn--brand"
              >
                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">تحديث</span>
              </button>
            )}

            {showInstallButton && (
              <button onClick={handleInstallClick} className="ut-btn ut-install hidden md:flex">
                <Download size={14} /> {isIos ? 'تثبيت على الآيفون' : 'تثبيت التطبيق'}
              </button>
            )}

            {/* الدخول للتقارير من القائمة الجانبية، والخروج منها من هنا.
                لا تظهر أزرار تنقّل في الترويسة إلا داخل التقارير. */}
            {!currentUser && activeView === 'reports' && (
              <button
                onClick={() => setActiveView('main')}
                className="ut-btn ut-btn--glass"
                style={{ height: 32, padding: '0 12px', fontSize: 12 }}
              >
                <Home size={14} />
                <span className="hidden sm:inline">العودة لتسجيل الدخول</span>
                <span className="sm:hidden">رجوع</span>
              </button>
            )}

            {currentUser && (
              <button
                onClick={handleLogout}
                className="ut-btn"
                style={{
                  background: 'rgba(239,68,68,.14)',
                  color: '#FCA5A5',
                  border: '1px solid rgba(239,68,68,.28)'
                }}
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">خروج</span>
              </button>
            )}
          </div>
        </div>

        <div className="ut-accent-bar" />

        {!isOnline && (
          <div
            className="text-white text-[11px] font-bold py-1.5 text-center"
            style={{ background: 'var(--grad-bad)' }}
          >
            لا يوجد اتصال بالإنترنت — يعمل التطبيق في الوضع غير المتصل
          </div>
        )}

        {showInstallButton && (
          <button
            onClick={handleInstallClick}
            className="ut-install md:hidden w-full text-white py-3.5 min-h-[44px] text-sm font-bold flex justify-center items-center gap-2"
            style={{ borderRadius: 0 }}
          >
            <Download size={16} /> {isIos ? 'تثبيت Uniteam على الآيفون' : 'تثبيت Uniteam على هاتفك'}
          </button>
        )}
      </header>

      <main className={`flex-1 w-full mx-auto pb-24 ${currentUser?.role === 'admin' ? 'admin-wide py-4 md:py-6' : 'max-w-6xl p-4 md:p-6'}`}>
        {activeView === 'reports' && !currentUser ? (
          <ReportsView syncUrl={config.syncUrl} adminConfig={config} onUpdateConfig={handleUpdateConfig} logAction={logAction} />
        ) : (
          !currentUser ? (
            <Login
              onLogin={handleLogin} allUsers={allUsers} adminConfig={config} availableJobs={jobs}
              branches={branches}
              setAdminConfig={handleUpdateConfig}
              logAction={logAction}
              onOpenReports={() => setActiveView('reports')}
            />
          ) : (
            currentUser.role === 'admin' ? (
              <AdminDashboard 
                branches={branches} setBranches={setBranches} jobs={jobs} setJobs={setJobs}
                records={records} config={config} setConfig={setConfig} allUsers={allUsers} setAllUsers={setAllUsers}
                reportAccounts={reportAccounts} setReportAccounts={setReportAccounts}
                visitPlans={visitPlans} setVisitPlans={setVisitPlans}
                onRefresh={() => syncWithCloud(config.syncUrl)} isSyncing={isSyncing}
                logAction={logAction}
              />
            ) : (
              <UserDashboard 
                user={currentUser} branches={branches} records={records} setRecords={setRecords}
                visitPlans={visitPlans}
                googleSheetLink={config.googleSheetLink} onRefresh={() => syncWithCloud(config.syncUrl)}
                isSyncing={isSyncing} lastUpdated={config.lastUpdated}
                logAction={logAction}
              />
            )
          )
        )}
      </main>
      
      <footer className="py-4 text-center relative z-10 text-slate-900 text-[10px] font-bold pb-6">
        <p>Uniteam &copy; 2026</p>
        <p className="mt-0.5 opacity-70">RTM Team - Bahaa Mohamed-Tel: 01095665450</p>
      </footer>

      {/* iOS Installation Instructions Modal */}
      {showIosInstructions && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl p-4 md:p-6 relative animate-in slide-in-from-bottom-10 duration-300">
            <button 
              onClick={() => setShowIosInstructions(false)}
              className="absolute left-4 top-4 text-slate-400 hover:text-white"
            >
              <X size={24} />
            </button>
            <div className="text-center space-y-4 pt-4">
              <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-900/30">
                <Download size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-black text-white">تثبيت التطبيق على الآيفون</h3>
              <p className="text-slate-400 text-xs font-bold leading-relaxed">
                نظراً لسياسات آبل، يرجى اتباع الخطوات التالية يدوياً لتثبيت التطبيق:
              </p>
              <div className="space-y-3 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 text-right">
                <div className="flex items-center gap-3 text-white text-sm font-bold">
                  <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-[10px]">1</span>
                  <span>اضغط على زر المشاركة في الأسفل</span>
                  <Share size={18} className="mr-auto text-blue-400" />
                </div>
                <div className="w-full h-px bg-slate-700/50"></div>
                <div className="flex items-center gap-3 text-white text-sm font-bold">
                  <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-[10px]">2</span>
                  <span>اختر "إضافة إلى الصفحة الرئيسية"</span>
                  <PlusSquare size={18} className="mr-auto text-blue-400" />
                </div>
                <div className="w-full h-px bg-slate-700/50"></div>
                <div className="flex items-center gap-3 text-white text-sm font-bold">
                  <span className="bg-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-[10px]">3</span>
                  <span>اضغط على "إضافة" (Add) في الأعلى</span>
                </div>
              </div>
              <button 
                onClick={() => setShowIosInstructions(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black py-3 rounded-xl transition-colors"
              >
                فهمت ذلك
              </button>
            </div>
            {/* Pointer arrow for mobile Safari */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full text-white animate-bounce md:hidden">
              <div className="flex flex-col items-center gap-2 mt-4">
                 <span className="text-[10px] font-black">اضغط هنا</span>
                 <svg width="24" height="24" viewBox="0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Developer Options Security Lock Screen Overlay */}
      {developerModeStatus.enabled && currentUser?.role !== 'admin' && (
        <div className="fixed inset-0 z-[999] bg-slate-950 text-white flex flex-col items-center justify-center p-4 md:p-6 text-center animate-in fade-in duration-300">
          <div className="bg-red-500/10 p-4 md:p-6 rounded-full border border-red-500/30 mb-6 animate-pulse">
            <ShieldAlert size={64} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-black text-red-500 mb-2">تم حظر فتح التطبيق</h2>
          <div className="bg-red-950/50 border border-red-800/60 p-4 rounded-2xl max-w-md text-xs font-bold leading-relaxed text-red-200 mb-6">
            <p className="mb-2">⚠️ تم اكتشاف تفعيل "وضع المطور" (Developer Options) أو "تصحيح USB" على هاتف الأندرويد.</p>
            <p>لدواعي أمان النظام ومنع التلاعب بالحضور والانصراف، يتوجب عليك إيقاف وضع المطور أولاً لتتمكن من استخدام التطبيق.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl max-w-md text-right text-xs space-y-2 text-slate-300 mb-6">
            <div className="font-black text-white border-b border-slate-800 pb-2 flex items-center gap-2">
              <Smartphone size={16} className="text-blue-400" /> خطوات فتح التطبيق:
            </div>
            <p>1. افتح "إعدادات الهاتف" (Settings).</p>
            <p>2. اذهب إلى "خيارات المطور" (Developer Options) أو "النظام".</p>
            <p>3. قم بـ **إيقاف/تعطيل** خيارات المطور (Developer Options Off).</p>
            <p>4. عد لتطبيق Uniteam واضغط إعادة الفحص بالأسفل.</p>
          </div>
          <button 
            onClick={() => setDeveloperModeStatus(checkDeveloperOptionsStatus())}
            className="bg-red-600 hover:bg-red-500 text-white font-black px-5 md:px-8 py-3.5 rounded-2xl text-sm shadow-xl transition-all cursor-pointer flex items-center gap-2"
          >
            <RefreshCw size={18} />
            إعادة الفحص الآن
          </button>
        </div>
      )}
    </div>
  );
};

export default App;

