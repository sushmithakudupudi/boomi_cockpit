import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, GitCompareArrows, HeartPulse, Info, Loader2, Lock, Mail, ShieldCheck, User, Wand2 } from 'lucide-react';
import { authApi } from '../../services/auth';
import type { ApiError } from '../../services/api';
import { ThemeSwitch } from '../Navbar';
import type { SignInScreenProps } from './AuthContext';

const inputCls =
  'w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-boomi-accent focus:ring-2 focus:ring-boomi-accent/20 transition disabled:opacity-60';

const Field: React.FC<{ label: string; icon: React.ElementType; children: React.ReactNode; hint?: React.ReactNode }> = ({ label, icon: Icon, children, hint }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-semibold text-slate-300">{label}</span>
    <span className="relative block">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
      {children}
    </span>
    {hint}
  </label>
);

const FEATURES = [
  { icon: HeartPulse, title: 'HealIQ', text: 'Triage failed executions and reprocess them with Keystone AI.' },
  { icon: Wand2, title: 'ArchForge', text: 'Turn a whiteboard flow into a dependency-ordered build plan.' },
  { icon: GitCompareArrows, title: 'ChangeLens', text: 'ChangeLens — see exactly what changed between any two component versions.' },
];

export const LoginPage: React.FC<SignInScreenProps> = ({ setupRequired, notice, error: initialError, onSignedIn }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  const rules = [
    { ok: password.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Za-z]/.test(password) && /\d/.test(password), label: 'A letter and a number' },
    { ok: password.length > 0 && password === confirm, label: 'Passwords match' },
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setupRequired && !rules.every((r) => r.ok)) {
      setError('Please choose a password that meets all the requirements.');
      return;
    }
    setBusy(true);
    try {
      const user = setupRequired
        ? await authApi.setup(email.trim(), password, fullName.trim())
        : await authApi.login(email.trim(), password, remember);
      onSignedIn(user);
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-boomi-navy text-slate-100">
      {/* Brand panel (wide screens) */}
      <aside className="hidden lg:flex w-[44%] max-w-xl flex-col justify-between p-10 bg-boomi-dark border-r border-boomi-cardBorder relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-boomi-accent/10 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-purple-500/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 p-0.5 rounded-xl bg-[#ffffff] border border-boomi-cardBorder shadow-sm">
            <img src="/esi-logo.png" alt="ESI" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="text-base font-bold text-white">BoomiOps</div>
            <div className="text-xs text-slate-500">Companion Cockpit</div>
          </div>
        </div>
        <div className="relative space-y-6">
          <h2 className="text-3xl font-extrabold leading-tight text-white">
            Run, heal and evolve your<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-purple-400">Boomi integrations.</span>
          </h2>
          <ul className="space-y-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="p-2 h-fit rounded-lg bg-slate-800 border border-slate-700"><Icon className="w-4 h-4 text-boomi-accent" /></span>
                <span>
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="block text-xs text-slate-400">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11px] text-slate-500 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />Passwords are salted and hashed; sessions use secure HttpOnly cookies.</p>
      </aside>

      {/* Form */}
      <main className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <div className="flex lg:invisible items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 p-0.5 rounded-lg bg-[#ffffff] border border-boomi-cardBorder"><img src="/esi-logo.png" alt="ESI" className="w-full h-full object-contain" /></div>
            <span className="text-sm font-bold text-white">BoomiOps</span>
          </div>
          <ThemeSwitch />
        </div>

        <div className="flex-1 flex items-center justify-center px-4 pb-10">
          <div className="w-full max-w-sm">
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-white">{setupRequired ? 'Create the admin account' : 'Sign in'}</h1>
              <p className="text-sm text-slate-400 mt-1.5">
                {setupRequired
                  ? 'No accounts exist yet. This first account will be the administrator.'
                  : 'Welcome back. Enter your work email and password.'}
              </p>
            </div>

            {notice && !error && (
              <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-200" role="status">
                <Info className="w-4 h-4 shrink-0 mt-px" />{notice}
              </div>
            )}
            <div aria-live="assertive">
              {error && (
                <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200" role="alert">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />{error}
                </div>
              )}
            </div>

            <form onSubmit={submit} className="space-y-4" noValidate={false}>
              {setupRequired && (
                <Field label="Full name" icon={User}>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder="Jane Doe" className={inputCls} disabled={busy} maxLength={120} />
                </Field>
              )}
              <Field label="Email" icon={Mail}>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={setupRequired ? 'email' : 'username'}
                  placeholder="you@company.com" className={inputCls} disabled={busy} autoFocus maxLength={254} />
              </Field>
              <Field label="Password" icon={Lock}>
                <input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={setupRequired ? 'new-password' : 'current-password'} placeholder="••••••••" className={`${inputCls} pr-10`} disabled={busy} maxLength={256} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 cursor-pointer">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </Field>
              {setupRequired && (
                <Field label="Confirm password" icon={Lock}
                  hint={
                    <ul className="grid gap-1 pt-1">
                      {rules.map((r) => (
                        <li key={r.label} className={`flex items-center gap-1.5 text-[11px] ${r.ok ? 'text-emerald-300' : 'text-slate-500'}`}>
                          <Check className={`w-3 h-3 ${r.ok ? '' : 'opacity-30'}`} />{r.label}
                        </li>
                      ))}
                    </ul>
                  }>
                  <input type={showPassword ? 'text' : 'password'} required value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password" placeholder="••••••••" className={inputCls} disabled={busy} maxLength={256} />
                </Field>
              )}

              {!setupRequired && (
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer w-fit">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4 accent-sky-500" disabled={busy} />
                  Keep me signed in for 30 days
                </label>
              )}

              <button type="submit" disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-boomi-blue to-boomi-accent hover:from-blue-600 hover:to-sky-400 text-white text-sm font-bold shadow-lg shadow-sky-900/30 transition cursor-pointer disabled:opacity-60 disabled:cursor-wait">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {busy ? (setupRequired ? 'Creating account…' : 'Signing in…') : (setupRequired ? 'Create account and sign in' : 'Sign in')}
              </button>
            </form>

            {!setupRequired && (
              <p className="mt-6 text-xs text-slate-500 text-center">Need an account or forgot your password? Ask your BoomiOps administrator.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
