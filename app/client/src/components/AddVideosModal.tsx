import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, ListVideo, Upload, X, Play, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { downloadsApi } from '@/api/downloads';
import { videosApi } from '@/api/videos';
import { useSSE } from '@/hooks/useSSE';
import { formatBytes } from '@/lib/utils';
import type { DownloadJob, BatchJob, PlaylistEntry } from '@/types';

type Tab = 'url' | 'upload';

interface AddVideosModalProps {
  open: boolean;
  onClose: () => void;
}

function DownloadItem({ job, onDismiss }: { job: DownloadJob; onDismiss: (id: string) => void }) {
  const [liveJob, setLiveJob] = useState<DownloadJob>(job);
  const active = ['starting', 'downloading', 'processing'].includes(liveJob.status);

  useSSE<DownloadJob>(
    active ? `/api/download/${job.id}/events` : null,
    (_, data) => setLiveJob(prev => ({ ...prev, ...data })),
  );

  const statusColor = { done: 'success', error: 'danger', starting: 'default', downloading: 'default', processing: 'default' }[liveJob.status] as any;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-elevated">
          <img src={`/api/download/${job.id}/thumb`} className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium text-text-primary">{liveJob.title}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant={statusColor} className="capitalize">{liveJob.status}</Badge>
              {(liveJob.status === 'done' || liveJob.status === 'error') && (
                <button onClick={() => onDismiss(job.id)} className="text-text-muted hover:text-text-primary">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          {active && <Progress value={liveJob.progress} className="mt-2" />}
          {active && (
            <p className="mt-1 text-xs text-text-muted">
              {liveJob.progress.toFixed(0)}%{liveJob.speed && ` · ${liveJob.speed}`}{liveJob.eta && ` · ETA ${liveJob.eta}`}
            </p>
          )}
          {liveJob.error && <p className="mt-1 text-xs text-danger line-clamp-2">{liveJob.error}</p>}
        </div>
      </div>
    </div>
  );
}

interface BatchItemViewProps { job: BatchJob; onDismiss: (id: string) => void }

function BatchItemView({ job: initialJob, onDismiss }: BatchItemViewProps) {
  const [job, setJob] = useState(initialJob);
  const [expanded, setExpanded] = useState(false);
  const active = job.status === 'running' || job.status === 'paused';

  useSSE<BatchJob>(active ? `/api/batch/${job.id}/events` : null, (_, data) => setJob(prev => ({ ...prev, ...data })));

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-text-primary">{job.title}</p>
            <Badge variant={job.status === 'done' ? 'success' : job.status === 'error' ? 'danger' : 'default'} className="capitalize shrink-0">
              {job.paused ? 'paused' : job.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-text-muted">{job.done} / {job.total} downloaded</p>
          {active && <Progress value={(job.done / job.total) * 100} className="mt-2" />}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {active && (
            <>
              {job.paused
                ? <Button size="sm" variant="secondary" onClick={() => downloadsApi.resumeBatch(job.id)}>Resume</Button>
                : <Button size="sm" variant="secondary" onClick={() => downloadsApi.pauseBatch(job.id)}>Pause</Button>
              }
              <Button size="sm" variant="danger" onClick={() => downloadsApi.stopBatch(job.id)}>Stop</Button>
            </>
          )}
          {!active && (
            <button onClick={() => onDismiss(job.id)} className="text-text-muted hover:text-text-primary">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => setExpanded(e => !e)} className="text-text-muted hover:text-text-primary ml-1">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
          {job.items.map(item => (
            <div key={item.index} className="flex items-center gap-2 rounded-lg px-2 py-1">
              <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                item.status === 'done' ? 'bg-success' : item.status === 'error' ? 'bg-danger' :
                item.status === 'downloading' ? 'bg-accent animate-pulse' : 'bg-text-subtle'
              }`} />
              <span className="flex-1 truncate text-xs text-text-muted">{item.title}</span>
              {item.status === 'downloading' && <span className="text-xs text-text-subtle">{item.progress.toFixed(0)}%</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AddVideosModal({ open, onClose }: AddVideosModalProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [folder, setFolder] = useState('');
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [probe, setProbe] = useState<{ title: string; entries: PlaylistEntry[] } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [batches, setBatches] = useState<BatchJob[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: tree } = useQuery({ queryKey: ['tree'], queryFn: videosApi.tree });
  const allFolders = ['', ...getFolderPaths(tree)];

  const probeMutation = useMutation({
    mutationFn: () => downloadsApi.probePlaylist(url),
    onSuccess: (data) => {
      setProbe(data);
      setSelected(new Set(data.entries.map(e => e.index)));
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to read playlist'),
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      if (isPlaylist && probe) {
        const items = probe.entries.filter(e => selected.has(e.index));
        return downloadsApi.startBatch({ url, folder, title: probe.title, items });
      }
      return downloadsApi.start(url, folder);
    },
    onSuccess: (data: any) => {
      if ('id' in data) {
        if (isPlaylist) {
          setBatches(prev => [...prev, { id: data.id, title: probe?.title || 'Playlist', status: 'running', paused: false, done: 0, total: selected.size, items: [] }]);
        } else {
          setJobs(prev => [...prev, { id: data.id, url, title: 'Downloading…', status: 'starting', progress: 0, folder, startedAt: Date.now() }]);
        }
        setUrl(''); setProbe(null);
        qc.invalidateQueries({ queryKey: ['videos'] });
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Download failed'),
  });

  const handleUpload = async () => {
    if (!selectedFile) return;
    try {
      setUploadProgress(0);
      await downloadsApi.upload(selectedFile, folder, setUploadProgress);
      toast.success('Uploaded successfully');
      setSelectedFile(null); setUploadProgress(null);
      qc.invalidateQueries({ queryKey: ['videos'] });
      qc.invalidateQueries({ queryKey: ['tree'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Upload failed');
      setUploadProgress(null);
    }
  };

  const autoDetectPlaylist = (v: string) =>
    /[?&]list=|\/playlist|\/sets\/|\/album\/|\/model\/|\/pornstar\/|\/channels?\/|\/users?\/|@|c\/|channel\/|user\//i.test(v);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add videos</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <DialogBody className="space-y-4">
            {/* Tabs */}
            <div className="flex rounded-lg border border-border bg-surface p-1 gap-1">
              {(['url', 'upload'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium transition-colors
                    ${tab === t ? 'bg-elevated text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                >
                  {t === 'url' ? <Link2 className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
                  {t === 'url' ? 'URL / Link' : 'Upload file'}
                </button>
              ))}
            </div>

            {/* Folder selector */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-muted">Save to folder</label>
              <select
                value={folder}
                onChange={e => setFolder(e.target.value)}
                className="w-full rounded-lg border border-border bg-elevated px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {allFolders.map(f => <option key={f} value={f}>{f || '/ (root)'}</option>)}
              </select>
            </div>

            {tab === 'url' && (
              <>
                <div className="flex gap-2">
                  <Input
                    value={url}
                    onChange={e => { setUrl(e.target.value); if (autoDetectPlaylist(e.target.value)) setIsPlaylist(true); setProbe(null); }}
                    placeholder="https://youtube.com/watch?v=… or playlist URL"
                    onKeyDown={e => { if (e.key === 'Enter') isPlaylist ? probeMutation.mutate() : downloadMutation.mutate(); }}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => isPlaylist ? probeMutation.mutate() : downloadMutation.mutate()}
                    disabled={!url.trim() || probeMutation.isPending || downloadMutation.isPending}
                  >
                    {probeMutation.isPending || downloadMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : isPlaylist && !probe ? <ListVideo className="h-4 w-4" />
                      : <Play className="h-4 w-4" />}
                    {isPlaylist && !probe ? 'Preview' : 'Download'}
                  </Button>
                </div>

                <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                  <input type="checkbox" checked={isPlaylist} onChange={e => { setIsPlaylist(e.target.checked); setProbe(null); }} className="rounded accent-accent" />
                  This is a playlist (preview first)
                </label>

                {probe && (
                  <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <p className="text-sm font-medium text-text-primary">{probe.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">{selected.size}/{probe.entries.length}</span>
                        <button onClick={() => setSelected(new Set(probe.entries.map(e => e.index)))} className="text-xs text-accent hover:underline">All</button>
                        <button onClick={() => setSelected(new Set())} className="text-xs text-text-muted hover:text-text-primary">None</button>
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {probe.entries.map(entry => (
                        <label key={entry.index} className="flex items-center gap-3 px-4 py-2 hover:bg-elevated cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected.has(entry.index)}
                            onChange={e => setSelected(prev => { const s = new Set(prev); e.target.checked ? s.add(entry.index) : s.delete(entry.index); return s; })}
                            className="rounded accent-accent shrink-0"
                          />
                          <span className="flex-1 truncate text-sm text-text-primary">{entry.title}</span>
                          {entry.duration && <span className="text-xs text-text-muted shrink-0">{Math.floor(entry.duration / 60)}:{String(Math.floor(entry.duration % 60)).padStart(2, '0')}</span>}
                        </label>
                      ))}
                    </div>
                    <div className="border-t border-border px-4 py-3">
                      <Button onClick={() => downloadMutation.mutate()} disabled={!selected.size || downloadMutation.isPending} className="w-full">
                        {downloadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        Download {selected.size} {selected.size === 1 ? 'video' : 'videos'}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'upload' && (
              <div className="space-y-3">
                <div
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-10 text-center cursor-pointer hover:border-accent/50 hover:bg-accent-light/5 transition-colors"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setSelectedFile(f); }}
                >
                  <Upload className="mb-2 h-8 w-8 text-text-subtle" />
                  <p className="text-sm font-medium text-text-primary">Drop a video file here</p>
                  <p className="mt-1 text-xs text-text-muted">or click to browse · mp4, mkv, webm, avi…</p>
                  <input ref={fileRef} type="file" accept="video/*,.mkv,.avi,.flv,.wmv,.m2ts,.ts" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }} />
                </div>
                {selectedFile && (
                  <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{selectedFile.name}</p>
                        <p className="text-xs text-text-muted">{formatBytes(selectedFile.size)}</p>
                      </div>
                      <button onClick={() => { setSelectedFile(null); setUploadProgress(null); }} className="text-text-muted hover:text-text-primary">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {uploadProgress !== null && <Progress value={uploadProgress} />}
                    <Button onClick={handleUpload} disabled={uploadProgress !== null} className="w-full">
                      {uploadProgress !== null ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {uploadProgress}%</> : <><Upload className="h-4 w-4" /> Upload</>}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Active downloads */}
            {(jobs.length > 0 || batches.length > 0) && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-text-subtle">Downloads</p>
                {jobs.map(j => (
                  <DownloadItem key={j.id} job={j} onDismiss={id => { downloadsApi.dismiss(id); setJobs(prev => prev.filter(x => x.id !== id)); }} />
                ))}
                {batches.map(b => (
                  <BatchItemView key={b.id} job={b} onDismiss={id => { downloadsApi.dismissBatch(id); setBatches(prev => prev.filter(x => x.id !== id)); }} />
                ))}
              </div>
            )}
          </DialogBody>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getFolderPaths(tree: any, acc: string[] = []): string[] {
  if (!tree) return acc;
  for (const child of tree.children || []) {
    acc.push(child.path);
    getFolderPaths(child, acc);
  }
  return acc;
}
