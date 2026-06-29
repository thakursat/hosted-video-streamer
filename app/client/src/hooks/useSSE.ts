import { useEffect, useRef } from 'react';

export function useSSE<T>(
  url: string | null,
  onEvent: (event: string, data: T) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url, { withCredentials: true });

    const handle = (event: MessageEvent, name: string) => {
      try {
        onEventRef.current(name, JSON.parse(event.data) as T);
      } catch {}
    };

    ['status', 'progress', 'update', 'error'].forEach(name => {
      es.addEventListener(name, (e) => handle(e as MessageEvent, name));
    });

    es.onerror = () => { es.close(); };

    return () => es.close();
  }, [url]);
}
