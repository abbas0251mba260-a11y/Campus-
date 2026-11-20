import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { Lock, Mail, User as UserIcon, X } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { BLUEPRINT_LIMITS, HOSTEL_BLOCKS, sanitizeText } from '../utils/validation';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: 'login' | 'signup';
  onClose: () => void;
  onProfileSeed?: (seed: {
    displayName: string;
    hostelBlock: string;
    program: string;
  }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode,
  onClose,
  onProfileSeed,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [hostelBlock, setHostelBlock] = useState(HOSTEL_BLOCKS[0]);
  const [program, setProgram] = useState('MBA Year 1 · DGU');
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    setMode(initialMode);
    setErrorMsg('');
    setInfoMsg('');
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleGoogleAuth = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const cleanEmail = sanitizeText(email, BLUEPRINT_LIMITS.emailMax);
    if (!cleanEmail || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }
    if (mode === 'signup') {
      const cleanName = sanitizeText(displayName, BLUEPRINT_LIMITS.displayNameMax);
      if (!cleanName) {
        setErrorMsg('Please enter your full name.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('Password must be at least 6 characters.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        onClose();
      } else {
        const cleanName = sanitizeText(displayName, BLUEPRINT_LIMITS.displayNameMax);
        const cleanHostel = sanitizeText(hostelBlock, BLUEPRINT_LIMITS.hostelBlockMax);
        const cleanProgram = sanitizeText(program, BLUEPRINT_LIMITS.programMax) || 'MBA Year 1 · DGU';

        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, { displayName: cleanName });
        if (onProfileSeed) {
          onProfileSeed({
            displayName: cleanName,
            hostelBlock: cleanHostel,
            program: cleanProgram,
          });
        }
        await sendEmailVerification(cred.user);
        setInfoMsg(
          'Account created! A verification email has been sent—verify your inbox to unlock bookings and verified reviews.'
        );
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          'Email/Password sign-in is not yet enabled in the Firebase Console (Authentication -> Sign-in method -> Email/Password). Please enable it there or use Continue with Google below.'
        );
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setErrorMsg('Invalid email or password. Please check your credentials and try again.');
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg('An account with this email already exists. Switch to Log In instead.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2
              id="auth-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {mode === 'login' ? 'Log in to CampusFin' : 'Create your CampusFin account'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              DGU Hostel &amp; PG Laundry · Student Budget &amp; Verified Reviews
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg('');
                setInfoMsg('');
              }}
              className={`py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg('');
                setInfoMsg('');
              }}
              className={`py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === 'signup'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Sign Up
            </button>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleGoogleAuth}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/70 text-sm font-medium text-slate-900 dark:text-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
              />
            </svg>
            <span>Continue with Google (Instant Verification)</span>
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
            <span className="shrink mx-3 text-xs text-slate-500 dark:text-slate-400">
              or use university / personal email
            </span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3.5">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      maxLength={BLUEPRINT_LIMITS.displayNameMax}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Abbas Naqvi"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Hostel / PG
                    </label>
                    <select
                      value={hostelBlock}
                      onChange={(e) => setHostelBlock(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {HOSTEL_BLOCKS.map((block) => (
                        <option key={block} value={block}>
                          {block}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Program / Batch
                    </label>
                    <input
                      type="text"
                      maxLength={BLUEPRINT_LIMITS.programMax}
                      value={program}
                      onChange={(e) => setProgram(e.target.value)}
                      placeholder="MBA Year 1 · DGU"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  maxLength={BLUEPRINT_LIMITS.emailMax}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@dgu.ac.in"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-200"
              >
                {errorMsg}
              </div>
            )}

            {infoMsg && (
              <div
                role="status"
                className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-800 dark:text-emerald-200"
              >
                {infoMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
            >
              {submitting
                ? 'Processing...'
                : mode === 'login'
                  ? 'Log In'
                  : 'Create Verified Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
