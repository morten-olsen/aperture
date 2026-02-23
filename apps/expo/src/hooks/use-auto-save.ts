import { useCallback, useEffect, useRef, useState } from 'react';

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useAutoSave = <T extends (...args: any[]) => Promise<unknown>>(saveFn: T) => {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const clearPendingTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const save = useCallback(
    async (...args: Parameters<T>) => {
      clearPendingTimeout();
      setStatus('saving');
      try {
        await saveFn(...args);
        if (!mountedRef.current) return;
        setStatus('saved');
        timeoutRef.current = setTimeout(() => {
          if (mountedRef.current) setStatus('idle');
        }, 2000);
      } catch {
        if (!mountedRef.current) return;
        setStatus('error');
        timeoutRef.current = setTimeout(() => {
          if (mountedRef.current) setStatus('idle');
        }, 3000);
      }
    },
    [saveFn],
  );

  return { save, status };
};

export type { AutoSaveStatus };
export { useAutoSave };
