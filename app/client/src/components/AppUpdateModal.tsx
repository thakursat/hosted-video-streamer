import { useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from './ui/dialog';
import { Button } from './ui/button';
import { settingsApi } from '@/api/settings';

interface AppUpdateModalProps {
  open: boolean;
  onClose: () => void;
}

type Phase = 'idle' | 'updating' | 'restarting' | 'done' | 'error';

export function AppUpdateModal({ open, onClose }: AppUpdateModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setLogs([]);
      esRef.current?.close();
    }
  }, [open]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  function startUpdate() {
    setPhase('updating');
    setLogs([]);

    const es = new EventSource(settingsApi.appUpdateUrl());
    esRef.current = es;

    es.addEventListener('log', e => {
      const { msg } = JSON.parse(e.data);
      setLogs(prev => [...prev, msg]);
    });

    es.addEventListener('error', e => {
      try {
        const { msg } = JSON.parse((e as MessageEvent).data);
        setLogs(prev => [...prev, `✗ ${msg}`]);
      } catch {}
      setPhase('error');
      es.close();
    });

    es.addEventListener('done', e => {
      const { msg } = JSON.parse(e.data);
      setLogs(prev => [...prev, msg]);
      es.close();
      setPhase('restarting');
      pollForRestart();
    });

    // SSE connection error (server restarted before sending 'done')
    es.onerror = () => {
      if (phase === 'updating') {
        es.close();
        setPhase('restarting');
        pollForRestart();
      }
    };
  }

  function pollForRestart() {
    const start = Date.now();
    const MAX_WAIT = 3 * 60 * 1000;

    const interval = setInterval(async () => {
      if (Date.now() - start > MAX_WAIT) {
        clearInterval(interval);
        setPhase('error');
        setLogs(prev => [...prev, '✗ Server did not come back within 3 minutes.']);
        return;
      }
      try {
        const res = await fetch('/api/ytdlp/version', { credentials: 'include' });
        if (res.ok) {
          clearInterval(interval);
          setPhase('done');
        }
      } catch {}
    }, 3000);
  }

  const canClose = phase === 'idle' || phase === 'done' || phase === 'error';

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && canClose) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Update Application</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {phase === 'idle' && (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">
                Downloads the latest release from GitHub, rebuilds the server and client, then restarts the service. The page will reconnect automatically.
              </p>
              <Button onClick={startUpdate} className="w-full">
                <RefreshCw className="h-4 w-4" />
                Start update
              </Button>
            </div>
          )}

          {(phase === 'updating' || phase === 'restarting' || phase === 'done' || phase === 'error') && (
            <div className="space-y-3">
              <div className="h-72 overflow-y-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-green-400 space-y-0.5">
                {logs.map((line, i) => (
                  <div key={i} className={line.startsWith('✗') ? 'text-red-400' : line.startsWith('✓') ? 'text-green-300' : 'text-text-muted'}>
                    {line}
                  </div>
                ))}
                {phase === 'restarting' && (
                  <div className="text-yellow-400 flex items-center gap-2 pt-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Waiting for server to restart…
                  </div>
                )}
                {phase === 'updating' && (
                  <div className="text-text-subtle flex items-center gap-2 pt-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Running…
                  </div>
                )}
                <div ref={logEndRef} />
              </div>

              {phase === 'done' && (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  Update complete — running latest version.
                </div>
              )}
              {phase === 'error' && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <XCircle className="h-4 w-4" />
                  Update failed. Check the log above.
                </div>
              )}

              {canClose && (
                <Button variant="secondary" onClick={onClose} className="w-full">
                  {phase === 'done' ? 'Reload page' : 'Close'}
                </Button>
              )}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
