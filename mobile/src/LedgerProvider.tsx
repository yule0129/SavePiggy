import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodeLedger } from './ledger';
import type { Entry } from './ledger';
import { AppState } from 'react-native';
import { paymentInbox } from './nativePaymentInbox';
import { mergePaymentEvents } from './paymentCapture';

const STORAGE_KEY = 'savepiggy.ledger.v1';

function useLedgerState() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const writing = useRef(false);
  const current = useRef<Entry[]>([]);
  const accept = useCallback((loaded: Entry[]) => {
    current.current = loaded;
    setEntries(loaded);
    setStorageError(false);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const loaded = decodeLedger(await AsyncStorage.getItem(STORAGE_KEY));
      accept(loaded);
    } catch { setStorageError(true); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => { if (active) accept(decodeLedger(raw)); })
      .catch(() => { if (active) setStorageError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accept]);

  const persist = useCallback(async (next: Entry[]): Promise<boolean> => {
    if (writing.current || storageError) return false;
    writing.current = true;
    setBusy(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries: next }));
      current.current = next;
      setEntries(next);
      return true;
    } catch { return false; }
    finally { writing.current = false; setBusy(false); }
  }, [storageError]);

  useEffect(() => {
    if (loading || storageError || !paymentInbox.supported) return;
    let syncing = false;
    const sync = async () => {
      if (syncing || writing.current || AppState.currentState !== 'active') return;
      syncing = true;
      try {
        const events = paymentInbox.list();
        if (!events.length) return;
        const merged = mergePaymentEvents(current.current, events);
        if (merged.added && !await persist(merged.entries)) throw new Error('候选未能写入账本，原生队列已保留，稍后重试');
        paymentInbox.acknowledge(merged.acceptedIds);
        setCaptureError('');
      } catch (error) { setCaptureError(error instanceof Error ? error.message : '付款候选同步失败，队列已保留'); }
      finally { syncing = false; }
    };
    void sync();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
    const timer = setInterval(() => { void sync(); }, 2000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [loading, storageError, persist]);
  return { entries, loading, storageError, busy, captureError, current, writing, load, persist };
}

const LedgerContext = createContext<ReturnType<typeof useLedgerState> | null>(null);

export function LedgerProvider({ children }: PropsWithChildren) {
  const ledger = useLedgerState();
  return <LedgerContext.Provider value={ledger}>{children}</LedgerContext.Provider>;
}

export function useLedger() {
  const ledger = useContext(LedgerContext);
  if (!ledger) throw new Error('LedgerProvider is missing');
  return ledger;
}
