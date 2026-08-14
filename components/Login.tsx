
import React, { useState, useRef } from 'react';
import { User, AppConfig, Job, Branch } from '../types';
import { UserPlus, LogIn, LogOut, ShieldAlert, Briefcase, Loader2, Link as LinkIcon, Smartphone, AlertCircle, WifiOff, MapPin, Eye, EyeOff, FileSpreadsheet, ArrowRight, KeyRound } from 'lucide-react';
import { getDeviceFingerprint } from '../utils';
import { LogoMark } from './Logo';
import ReportsView from './ReportsView';

interface LoginProps {
  onLogin: (user: User) => void;
  allUsers: User[];
  adminConfig: AppConfig;
  availableJobs: Job[];
  branches: Branch[];
  setAdminConfig: (cfg: Partial<AppConfig>) => void;
  logAction: (action: string, details?: string) => void;
  onSync?: (url?: string, force?: boolean) => Promise<any>;
  /** يفتح شاشة التقارير كصفحة مستقلة أو داخلية */
  onOpenReports?: () => void;
}

export default function Login({ 
  onLogin, 
  allUsers, 
  adminConfig, 
  availableJobs, 
  branches, 
  setAdminConfig,
  logAction,
  onSync,
  onOpenReports
}: LoginProps) {
  const [mode, setMode] = useState<'register' | 'login' | 'admin' | 'reports'>('login');
  const [isReportsLoggedIn, setIsReportsLoggedIn] = useState(false);
  const reportsLogoutRef = useRef<(() => void) | null>(null);
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedJob, setSelectedJob] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // ---------- استعادة كلمة المرور ----------
  // شاشة من خطوتين: تحقّق من الهوية والجهاز، ثم تعيين كلمة جديدة.
  // التحقق كله في الخادم — القائمة المحلية لا يُعتمد عليها هنا.
  const [showRecovery, setShowRecovery] = useState(false);
  const [recStep, setRecStep] = useState<1 | 2>(1);
  const [recNationalId, setRecNationalId] = useState('');
  const [recNewPass, setRecNewPass] = useState('');
  const [recConfirmPass, setRecConfirmPass] = useState('');
  const [recShowPass, setRecShowPass] = useState(false);
  const [recVerifiedName, setRecVerifiedName] = useState('');
  const [recError, setRecError] = useState('');
  const [recSuccess, setRecSuccess] = useState('');
  const [recLoading, setRecLoading] = useState(false);

  const closeRecovery = () => {
    setShowRecovery(false);
    setRecStep(1);
    setRecNationalId('');
    setRecNewPass('');
    setRecConfirmPass('');
    setRecVerifiedName('');
    setRecError('');
    setRecSuccess('');
  };

  /** نداء الخادم لإجراء الاستعادة الذاتية — بلا no-cors ليُقرأ الردّ فعلاً */
  const callRecovery = async (newPassword?: string) => {
    const response = await fetch(adminConfig.syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'resetPasswordSelf',
        nationalId: recNationalId.trim(),
        deviceId: getDeviceFingerprint(),
        newPassword: newPassword
      })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (!text || text.trim().startsWith('<')) throw new Error('INVALID_RESPONSE');
    return text.trim();
  };

  /** الخطوة الأولى: التحقق من الهوية والجهاز بلا كتابة أي شيء */
  const handleRecoveryVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecError('');

    if (!navigator.onLine) {
      setRecError('لا يمكن استعادة كلمة المرور والجهاز غير متصل بالإنترنت.');
      return;
    }
    if (!adminConfig.syncUrl) {
      setRecError('التطبيق غير مربوط بالسحابة. راجع المسؤول.');
      return;
    }
    if (!recNationalId.trim()) {
      setRecError('يرجى إدخال الرقم القومي.');
      return;
    }

    setRecLoading(true);
    try {
      const text = await callRecovery();
      if (text.startsWith('Verified:')) {
        setRecVerifiedName(text.replace('Verified:', '').trim());
        setRecStep(2);
        logAction('طلب استعادة كلمة مرور', `الرقم القومي: ${recNationalId.trim()}`);
      } else {
        setRecError(text.replace(/^Error:\s*/, ''));
        logAction('فشل التحقق لاستعادة كلمة المرور', `الرقم القومي: ${recNationalId.trim()} | ${text}`);
      }
    } catch (err: any) {
      setRecError(
        err.message === 'INVALID_RESPONSE'
          ? 'رابط الشركة لا يؤدي إلى كود النظام. راجع المسؤول.'
          : 'تعذر الاتصال بالخادم. تأكد من الإنترنت وحاول مجدداً.'
      );
    } finally {
      setRecLoading(false);
    }
  };

  /** الخطوة الثانية: تعيين كلمة المرور الجديدة */
  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecError('');

    const pass = recNewPass.trim();
    if (pass.length < 6) { setRecError('كلمة المرور يجب ألا تقل عن ٦ خانات.'); return; }
    if (pass.startsWith('0')) { setRecError('كلمة المرور لا يمكن أن تبدأ بصفر.'); return; }
    if (pass !== recConfirmPass.trim()) { setRecError('كلمتا المرور غير متطابقتين.'); return; }

    setRecLoading(true);
    try {
      const text = await callRecovery(pass);
      if (text.includes('Password Reset Successfully')) {
        setRecSuccess('تم تغيير كلمة المرور بنجاح. يمكنك الدخول بها الآن.');
        logAction('نجاح استعادة كلمة المرور', `الموظف: ${recVerifiedName}`);
        // مزامنة فورية: النسخة المحلية ما زالت تحمل كلمة المرور القديمة
        await onSync?.(undefined, true);
        setNationalId(recNationalId.trim());
        setTimeout(closeRecovery, 2200);
      } else {
        setRecError(text.replace(/^Error:\s*/, ''));
      }
    } catch (err: any) {
      setRecError(
        err.message === 'INVALID_RESPONSE'
          ? 'رابط الشركة لا يؤدي إلى كود النظام. راجع المسؤول.'
          : 'تعذر الاتصال بالخادم. تأكد من الإنترنت وحاول مجدداً.'
      );
    } finally {
      setRecLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!navigator.onLine) {
      setError('عذراً، لا يمكن إتمام عملية التسجيل والجهاز غير متصل بالإنترنت.');
      logAction('فشل تسجيل مستخدم جديد', 'السبب: الجهاز غير متصل بالإنترنت');
      return;
    }

    if (!fullName || !nationalId || !password || !confirmPassword || !selectedJob || !defaultBranch) {
      setError('يرجى إكمال جميع البيانات واختيار الوظيفة والفرع الأساسي');
      logAction('فشل تسجيل مستخدم جديد', 'السبب: بيانات ناقصة');
      return;
    }

    if (password !== confirmPassword) {
      setError('كلمة المرور وتأكيد كلمة المرور غير متطابقين');
      logAction('فشل تسجيل مستخدم جديد', 'السبب: عدم تطابق كلمة المرور وتأكيدها');
      return;
    }
    
    if (nationalId.length !== 14) {
      setError('الرقم القومي يجب أن يكون 14 رقماً');
      logAction('فشل تسجيل مستخدم جديد', `السبب: طول الرقم القومي غير صحيح (${nationalId.length})`);
      return;
    }
    
    if (password.length < 6) {
      setError('كلمة المرور يجب ألا تقل عن 6 أرقام/حروف');
      logAction('فشل تسجيل مستخدم جديد', 'السبب: كلمة المرور قصيرة جداً');
      return;
    }

    if (password.startsWith('0')) {
      setError('كلمة المرور لا يمكن أن تبدأ بالرقم صفر (0) أو تكون أصفاراً فقط .');
      logAction('فشل تسجيل مستخدم جديد', 'السبب: كلمة المرور تبدأ بصفر');
      return;
    }
    
    const deviceId = getDeviceFingerprint();

    const existingById = allUsers.find(u => u.nationalId === nationalId);
    if (existingById) {
      setError('عذراً، هذا الرقم القومي مسجل مسبقاً في النظام.');
      logAction('فشل تسجيل مستخدم جديد', `السبب: الرقم القومي مسجل مسبقاً (${nationalId})`);
      return;
    }

    // Check if device is already registered to another user (strictly)
    // Note: With multi-device support, a device ideally shouldn't be shared, but strictness can be relaxed if needed.
    // Here we keep it strict: One device = One User identity.
    const deviceOwner = allUsers.find(u => 
      u.deviceId === deviceId || (u.deviceIds && u.deviceIds.includes(deviceId))
    );
    if (deviceOwner) {
      setError(`عذراً، هذا الهاتف مرتبط بالفعل بحساب موظف آخر (${deviceOwner.fullName}).`);
      logAction('فشل تسجيل مستخدم جديد', `السبب: الهاتف مرتبط بموظف آخر (${deviceOwner.fullName})`);
      return;
    }

    setIsLoading(true);

    const branchObj = branches.find(b => b.id === defaultBranch);
    const branchNameForSheet = branchObj ? branchObj.name : defaultBranch;

    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      fullName,
      nationalId,
      password,
      role: 'employee',
      deviceId: deviceId, // Legacy
      deviceIds: [deviceId], // New
      allowedDeviceCount: 1, // Default
      jobTitle: selectedJob,
      defaultBranchId: branchNameForSheet,
      registrationDate: new Date().toISOString()
    };

    if (adminConfig.googleSheetLink) {
      try {
        await fetch(adminConfig.googleSheetLink, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'registerUser',
            ...newUser,
            timestamp: newUser.registrationDate
          })
        });
      } catch (err) {
        console.error("Cloud registration failed", err);
      }
    }

    setIsLoading(false);
    logAction('تسجيل مستخدم جديد', `الموظف: ${fullName}, الوظيفة: ${selectedJob}`);
    onLogin(newUser);
  };

  const handleEmployeeLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!navigator.onLine) {
      setError('عذراً، لا يمكن تسجيل الدخول والجهاز غير متصل بالإنترنت.');
      logAction('فشل تسجيل دخول موظف', 'السبب: الجهاز غير متصل بالإنترنت');
      return;
    }

    setIsLoading(true);
    setError('');

    let currentUsersList = allUsers;
    const syncTargetUrl = adminConfig.syncUrl || adminConfig.googleSheetLink;

    // 1. المزامنة المباشرة مع شيت جوجل قبل التحقق من بيانات الدخول بالرقم القومي وكلمة المرور
    if (onSync && syncTargetUrl) {
      try {
        const syncedData = await onSync(syncTargetUrl, true);
        if (syncedData && Array.isArray(syncedData.users)) {
          currentUsersList = syncedData.users;
        }
      } catch (err) {
        console.warn('Pre-login sync notice:', err);
      }
    }

    if (currentUsersList.length === 0 && syncTargetUrl) {
      setError('تعذر جلب بيانات الموظفين من شيت جوجل، يرجى التأكد من الاتصال بالإنترنت ومحاولة الدخول مجدداً.');
      logAction('فشل تسجيل دخول موظف', 'السبب: تعذر جلب بيانات الموظفين');
      setIsLoading(false);
      return;
    }

    const trimmedNId = nationalId.trim();
    const trimmedPass = password.trim();

    const user = currentUsersList.find(u => 
      String(u.nationalId).trim() === trimmedNId && 
      String(u.password).trim() === trimmedPass
    );
    
    if (user) {
      const currentDeviceId = getDeviceFingerprint();
      
      // Check if this device belongs to someone else
      const otherDeviceOwner = currentUsersList.find(u => 
        u.id !== user.id && 
        String(u.nationalId).trim() !== trimmedNId &&
        ((u.deviceId === currentDeviceId) || (u.deviceIds && u.deviceIds.includes(currentDeviceId)))
      );
      
      if (otherDeviceOwner) {
        setError(`عذراً، هذا الهاتف مسجل باسم موظف آخر (${otherDeviceOwner.fullName}).`);
        logAction('فشل تسجيل دخول موظف', `السبب: الهاتف مسجل باسم موظف آخر (${otherDeviceOwner.fullName})`);
        setIsLoading(false);
        return;
      }

      // Logic for Multi-Device Support
      const userDevices = Array.isArray(user.deviceIds) ? user.deviceIds : (user.deviceId ? [user.deviceId] : []);
      const maxDevices = user.allowedDeviceCount || 1;

      if (userDevices.includes(currentDeviceId)) {
        // Device is already linked -> Allow Login
        setIsLoading(false);
        logAction('تسجيل دخول موظف', `الموظف: ${user.fullName}, الرقم القومي: ${user.nationalId}`);
        onLogin(user);
      } else {
        // Device not linked, check if we can add it
        if (userDevices.length < maxDevices) {
          // Add new device
          const updatedDevices = [...userDevices, currentDeviceId];
          const updatedUser = { 
            ...user, 
            deviceIds: updatedDevices,
            deviceId: currentDeviceId
          };
          
          if (syncTargetUrl) {
            try {
              await fetch(syncTargetUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  action: 'updateUserDevice',
                  nationalId: updatedUser.nationalId,
                  userId: updatedUser.id,
                  deviceIds: updatedDevices
                })
              });
              
              // CRITICAL: Re-sync from Google Sheets to confirm device ID saved and update global state
              if (onSync) {
                const refreshedData = await onSync(syncTargetUrl, true);
                if (refreshedData && Array.isArray(refreshedData.users)) {
                  const refreshedUser = refreshedData.users.find((u: User) => 
                    String(u.nationalId).trim() === String(updatedUser.nationalId).trim()
                  );
                  if (refreshedUser) {
                    setIsLoading(false);
                    logAction('تسجيل دخول موظف (ربط جهاز جديد)', `الموظف: ${refreshedUser.fullName}, الجهاز: ${currentDeviceId}`);
                    onLogin(refreshedUser);
                    return;
                  }
                }
              }
            } catch (err) {
              console.error("Sync device update failed", err);
            }
          }
          setIsLoading(false);
          logAction('تسجيل دخول موظف (ربط جهاز جديد)', `الموظف: ${updatedUser.fullName}, الجهاز: ${currentDeviceId}`);
          onLogin(updatedUser);
        } else {
          // Limit reached
          setIsLoading(false);
          logAction('فشل تسجيل دخول (تجاوز عدد الأجهزة)', `الموظف: ${user.fullName}, الجهاز: ${currentDeviceId}`);
          setError(`عذراً، لقد تجاوزت الحد المسموح من الأجهزة (${userDevices.length}/${maxDevices}). يرجى التواصل مع المسؤول.`);
        }
      }
    } else {
      setIsLoading(false);
      logAction('فشل تسجيل دخول موظف', `الرقم القومي: ${nationalId}`);
      setError('بيانات الدخول غير صحيحة، تأكد من الرقم القومي وكلمة المرور المسجلة بالشيت.');
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const user = adminUsername.trim();
    const pass = adminPassword.trim();
    
    // Check strictly against configured Admin credentials (SSOT)
    const isAdminValid = user === adminConfig.adminUsername && pass === adminConfig.adminPassword;

    if (!isAdminValid) {
      logAction('فشل تسجيل دخول مسؤول', `حساب غير مصرح له كمسؤول: ${user}`);
      setError('بيانات دخول المسؤول غير صحيحة. يرجى إدخال اسم المستخدم وكلمة المرور الخاصة بالإدارة فقط.');
      setIsLoading(false);
      return;
    }

    // Optional cloud check if syncUrl is available to confirm cloud status for admin
    if (adminConfig.syncUrl) {
      try {
        const response = await fetch(`${adminConfig.syncUrl}?action=getReportData&user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}`);
        const data = await response.json();
        
        if (data.error) {
          logAction('فشل تسجيل دخول مسؤول (سحابي)', `المسؤول: ${user}`);
          setError('بيانات الدخول غير صحيحة أو تم رفضها من الخادم السحابي.');
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.warn("Cloud admin check warning", err);
      }
    }

    logAction('تسجيل دخول مسؤول', `المسؤول: ${user}`);
    onLogin({ id: 'admin-id', fullName: 'المسؤول', nationalId: '000', role: 'admin' });
    setIsLoading(false);
  };

  const inputClasses = "w-full px-4 py-3.5 rounded-2xl border border-slate-600 bg-slate-900 text-white placeholder:text-slate-500 font-bold outline-none focus:border-blue-500 transition-all shadow-inner";

  const TABS: { id: 'login' | 'register' | 'admin' | 'reports'; label: string; icon: any; desc: string }[] = [
    { id: 'login',    label: 'دخول الموظف', icon: LogIn,       desc: 'سجّل حضورك وانصرافك' },
    { id: 'register', label: 'حساب جديد',   icon: UserPlus,    desc: 'أنشئ حسابك لأول مرة' },
    { id: 'admin',    label: 'الإدارة',      icon: ShieldAlert, desc: 'لوحة تحكم المسؤول' },
    { id: 'reports',  label: 'التقارير',    icon: FileSpreadsheet, desc: 'عرض وتصدير سجلات الحضور والانصراف' }
  ];

  const showSidebar = !(mode === 'reports' && isReportsLoggedIn);

  return (
    <div className={`login-shell login-shell--reports-full ${mode === 'reports' ? (isReportsLoggedIn ? '!max-w-none !w-full !grid-cols-1' : 'max-w-6xl') : ''}`}>

      {/* ===================== القائمة الجانبية ===================== */}
      {showSidebar && (
        <aside className="login-side">
          <div className="login-side__head">
            <div className="flex justify-center mb-3">
              <LogoMark size={132} variant="full" />
            </div>
            <div className="login-side__sub">نظام الحضور والانصراف</div>
          </div>

          <nav className="login-side__nav">
            {TABS.filter(t => t.id !== 'reports').map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setMode(t.id); setError(''); }}
                className={`login-tab${mode === t.id ? ' login-tab--active' : ''}`}
              >
                <t.icon size={17} className="login-tab__icon" />
                <span>{t.label}</span>
              </button>
            ))}

            {/* فاصل وسُمة مميزة لبند التقارير */}
            <div className="my-2 border-t border-slate-700/80 pt-2 col-span-full sm:col-span-1">
              <div className="text-[10px] font-black text-slate-400 mb-1.5 flex items-center gap-1 hidden sm:flex px-1">
                <FileSpreadsheet size={12} className="text-emerald-400" />
                <span>قسم التقارير والنتائج</span>
              </div>
              {/* أصناف bg-emerald-* من Tailwind كانت تخسر أمام .login-tab في
                  theme.css لتساوي النوعية وتأخّر استيراد theme، فلا يظهر
                  التفعيل الأخضر إطلاقاً. الحالة الآن من نظام الرموز. */}
              <button
                type="button"
                onClick={() => { setMode('reports'); setError(''); }}
                className={`login-tab login-tab--reports w-full flex items-center justify-between gap-2 px-3 py-2.5 transition-all cursor-pointer ${
                  mode === 'reports' ? 'login-tab--active' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* لا text-emerald-400 هنا: skin.css يعرّفها بـ !important
                      فتبقى الأيقونة خضراء فوق الخلفية الخضراء عند التفعيل.
                      لونها في الحالتين يأتي من .login-tab--reports. */}
                  <FileSpreadsheet size={17} className="login-tab__icon" />
                  <span className="font-black text-xs">التقارير</span>
                </div>
              </button>
            </div>
          </nav>

        </aside>
      )}

      {/* ===================== البطاقة الرئيسية ===================== */}
      <div className={`bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl overflow-hidden ${!showSidebar ? 'w-full' : ''}`}>
        <div className="ut-accent-bar" />

        <div className="p-4 md:p-8">
          <div className="mb-6 flex items-center justify-between border-b border-slate-700/60 pb-4">
            <div>
              <h2 className="text-white text-lg font-black flex items-center gap-2">
                {mode === 'reports' && <FileSpreadsheet className="text-emerald-400" size={20} />}
                {TABS.find(t => t.id === mode)?.label}
              </h2>
              <p className="text-slate-400 text-[11px] font-bold mt-1">
                {TABS.find(t => t.id === mode)?.desc}
              </p>
            </div>
            {mode === 'reports' && isReportsLoggedIn && (
              <button 
                type="button" 
                onClick={() => reportsLogoutRef.current?.()} 
                className="bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/80 text-xs font-bold px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:border-red-500/80 shrink-0"
              >
                <LogOut size={15} className="text-red-400" />
                <span>تسجيل خروج</span>
              </button>
            )}
          </div>

          {mode === 'reports' ? (
            <div className="pt-2">
              <ReportsView 
                syncUrl={adminConfig.syncUrl} 
                adminConfig={adminConfig} 
                onUpdateConfig={setAdminConfig} 
                logAction={logAction} 
                onLoginStateChange={setIsReportsLoggedIn}
                onLogoutRef={reportsLogoutRef}
              />
            </div>
          ) : (
            <>
              {!adminConfig.syncUrl && mode !== 'admin' && (
                <div className="mb-5 p-4 bg-blue-900/20 border-r-4 border-blue-500 rounded-xl">
                  <p className="text-blue-400 text-xs font-bold">جارٍ الاتصال بالخادم…</p>
                </div>
              )}

          {!navigator.onLine && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-2xl flex items-center gap-3 text-red-400 text-[11px] font-black">
              <WifiOff size={16} /> الهاتف غير متصل بالإنترنت
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-900/20 border-r-4 border-red-500 rounded-xl text-red-400 text-xs font-bold flex gap-2 items-start">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isLoading && (
            <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/50 rounded-2xl flex items-center justify-center gap-2 text-blue-400 text-xs font-bold">
              <Loader2 className="animate-spin" size={16} /> جارٍ المعالجة والتحقق…
            </div>
          )}

          {/* ===== حساب جديد ===== */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <input type="text" placeholder="الاسم الرباعي" value={fullName} onChange={e => setFullName(e.target.value)} className={inputClasses} />
              <input type="text" placeholder="الرقم القومي (14 رقم)" maxLength={14} inputMode="numeric" value={nationalId} onChange={e => setNationalId(e.target.value.replace(/\D/g, ''))} className={inputClasses} />

              <div className="relative">
                <select value={selectedJob} onChange={e => setSelectedJob(e.target.value)} className={`${inputClasses} appearance-none cursor-pointer text-right`}>
                  <option value="">-- اختر الوظيفة --</option>
                  {availableJobs.map(job => <option key={job.id} value={job.title}>{job.title}</option>)}
                </select>
                <Briefcase size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <select value={defaultBranch} onChange={e => setDefaultBranch(e.target.value)} className={`${inputClasses} appearance-none cursor-pointer text-right`}>
                  <option value="">-- اختر فرع العمل الأساسي --</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>

              <div className="relative">
                <input type={showRegPassword ? 'text' : 'password'} placeholder="تعيين كلمة مرور" minLength={6} value={password} onChange={e => setPassword(e.target.value)} className={`${inputClasses} pl-12`} />
                <button type="button" onClick={() => setShowRegPassword(!showRegPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                  {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="relative">
                <input type={showConfirmPassword ? 'text' : 'password'} placeholder="تأكيد كلمة المرور" minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={`${inputClasses} pl-12`} />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2">
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : <UserPlus size={20} />}
                {isLoading ? 'جارٍ الحفظ…' : 'تسجيل وتأمين الجهاز'}
              </button>
            </form>
          )}

          {/* ===== دخول الموظف ===== */}
          {mode === 'login' && (
            <form onSubmit={handleEmployeeLogin} className="space-y-4">
              <input type="text" placeholder="الرقم القومي" maxLength={14} inputMode="numeric" value={nationalId} onChange={e => setNationalId(e.target.value.replace(/\D/g, ''))} className={inputClasses} />
              <div className="relative">
                <input type={showLoginPassword ? 'text' : 'password'} placeholder="كلمة المرور" value={password} onChange={e => setPassword(e.target.value)} className={`${inputClasses} pl-12`} />
                <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                  {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 text-sm">
                <LogIn size={20} /> دخول
              </button>

              <button
                type="button"
                onClick={() => { setShowRecovery(true); setRecNationalId(nationalId.trim()); }}
                className="w-full text-center text-[11px] font-bold text-blue-400 py-2 rounded-xl cursor-pointer"
              >
                نسيت كلمة المرور؟
              </button>
            </form>
          )}

          {/* ===== استعادة كلمة المرور ===== */}
          {mode === 'login' && showRecovery && (
            <div className="mt-4 p-4 rounded-2xl border border-blue-500/40 bg-blue-950/25 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-white text-sm font-black flex items-center gap-2">
                    <KeyRound size={17} className="text-blue-400" />
                    استعادة كلمة المرور
                  </div>
                  <p className="text-[11px] text-slate-400 font-bold mt-1 leading-relaxed">
                    {recStep === 1
                      ? 'الاستعادة متاحة من هاتفك المسجّل فقط. إن كنت غيّرت هاتفك راجع المسؤول.'
                      : `تم التحقق من هويتك: ${recVerifiedName}`}
                  </p>
                </div>
                <button type="button" onClick={closeRecovery} className="text-slate-400 text-xs font-black px-2 py-1 rounded-lg cursor-pointer shrink-0">
                  إغلاق
                </button>
              </div>

              {recSuccess ? (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                  {recSuccess}
                </div>
              ) : recStep === 1 ? (
                <form onSubmit={handleRecoveryVerify} className="space-y-3">
                  <input
                    type="text" placeholder="الرقم القومي" maxLength={14} inputMode="numeric"
                    value={recNationalId}
                    onChange={e => setRecNationalId(e.target.value.replace(/\D/g, ''))}
                    className={inputClasses}
                  />
                  {recError && (
                    <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-[11px] font-bold flex gap-2 items-start">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" /><span>{recError}</span>
                    </div>
                  )}
                  <button type="submit" disabled={recLoading} className="w-full bg-blue-600 text-white font-black py-3 rounded-2xl flex items-center justify-center gap-2 text-xs">
                    {recLoading ? <Loader2 className="animate-spin" size={17} /> : <Smartphone size={17} />}
                    {recLoading ? 'جارٍ التحقق…' : 'تحقّق من هويتي'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRecoverySubmit} className="space-y-3">
                  <div className="relative">
                    <input
                      type={recShowPass ? 'text' : 'password'} placeholder="كلمة المرور الجديدة" minLength={6}
                      value={recNewPass} onChange={e => setRecNewPass(e.target.value)}
                      className={`${inputClasses} pl-12`}
                    />
                    <button type="button" onClick={() => setRecShowPass(!recShowPass)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors">
                      {recShowPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <input
                    type={recShowPass ? 'text' : 'password'} placeholder="تأكيد كلمة المرور الجديدة" minLength={6}
                    value={recConfirmPass} onChange={e => setRecConfirmPass(e.target.value)}
                    className={inputClasses}
                  />
                  {recError && (
                    <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-[11px] font-bold flex gap-2 items-start">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" /><span>{recError}</span>
                    </div>
                  )}
                  <button type="submit" disabled={recLoading} className="w-full bg-emerald-600 text-white font-black py-3 rounded-2xl flex items-center justify-center gap-2 text-xs">
                    {recLoading ? <Loader2 className="animate-spin" size={17} /> : <KeyRound size={17} />}
                    {recLoading ? 'جارٍ الحفظ…' : 'تعيين كلمة المرور'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ===== دخول المسؤول ===== */}
          {mode === 'admin' && (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <input type="text" placeholder="اسم مستخدم المسؤول" value={adminUsername} onChange={e => setAdminUsername(e.target.value)} className={inputClasses} />
              <div className="relative">
                <input type={showAdminPassword ? 'text' : 'password'} placeholder="كلمة مرور المسؤول" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className={`${inputClasses} pl-12`} />
                <button type="button" onClick={() => setShowAdminPassword(!showAdminPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
                  {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2">
                <ShieldAlert size={20} /> دخول لوحة التحكم
              </button>
            </form>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
