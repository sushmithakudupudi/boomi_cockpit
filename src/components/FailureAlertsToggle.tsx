import React, { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';

// Lets the user turn on browser notifications for new Boomi failures. Alerts arrive through the
// backend's failure watcher and a service worker, so they work with the page closed
// (the browser must be running).

type AlertState = 'unsupported' | 'blocked' | 'off' | 'on' | 'working';

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

interface Props {
  onShowToast?: (msg: string) => void;
}

export const FailureAlertsToggle: React.FC<Props> = ({ onShowToast }) => {
  const [state, setState] = useState<AlertState>(supported() ? 'off' : 'unsupported');
  const [message, setMessage] = useState<string>('');

  const refresh = useCallback(async () => {
    if (!supported()) return;
    if (Notification.permission === 'denied') {
      setState('blocked');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    } catch {
      setState('off');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const enable = async () => {
    setState('working');
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        setMessage('Notifications were not allowed.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const keyRes = await fetch('/api/notifications/vapid-key');
      if (!keyRes.ok) throw new Error('The backend could not provide a push key.');
      const { publicKey } = await keyRes.json();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const saved = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!saved.ok) throw new Error('The backend rejected the subscription.');
      setState('on');
      if (onShowToast) onShowToast('🔔 Failure alerts are on for this browser.');
    } catch (e) {
      setState('off');
      setMessage(e instanceof Error ? e.message : 'Could not turn on alerts.');
    }
  };

  const disable = async () => {
    setState('working');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
      if (onShowToast) onShowToast('Failure alerts are off for this browser.');
    } catch {
      await refresh();
    }
  };

  const sendTest = async () => {
    setMessage('');
    const res = await fetch('/api/notifications/test', { method: 'POST' }).catch(() => null);
    if (!res) return setMessage('The backend is not reachable.');
    if (!res.ok) {
      const detail = await res.json().then((j) => j.detail).catch(() => '');
      return setMessage(typeof detail === 'string' && detail ? detail : 'The test alert could not be sent.');
    }
    const out = await res.json();
    setMessage(out.sent > 0 ? 'Test alert sent.' : 'The push service did not accept the test alert.');
  };

  if (state === 'unsupported') {
    return <p className="text-[11px] text-slate-500">This browser does not support background alerts.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {state === 'on' ? (
        <>
          <span className="flex items-center gap-1.5 text-emerald-300"><Bell className="w-3.5 h-3.5" /> Failure alerts on</span>
          <button onClick={sendTest} className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer">Send test</button>
          <button onClick={disable} className="px-2 py-1 rounded-lg text-slate-400 hover:text-white cursor-pointer">Turn off</button>
        </>
      ) : state === 'blocked' ? (
        <span className="flex items-center gap-1.5 text-amber-300"><BellOff className="w-3.5 h-3.5" /> Notifications are blocked for this site in the browser settings.</span>
      ) : (
        <button
          onClick={enable}
          disabled={state === 'working'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold cursor-pointer disabled:opacity-60"
        >
          <Bell className="w-3.5 h-3.5" /> {state === 'working' ? 'Working…' : 'Alert me about new failures'}
        </button>
      )}
      {message && <span className="text-slate-400">{message}</span>}
    </div>
  );
};
