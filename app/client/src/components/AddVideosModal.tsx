import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Link2, ListVideo, Upload, X, Play, Loader2,
  ChevronDown, ChevronUp, SkipForward, Pause, Square,
} from 'lucide-react';
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
import type { DownloadJob, BatchJob, BatchItem, PlaylistEntry } from '@/types';

type Tab = 'url' | 'upload';

interface AddVideosModalProps {
  open: boolean;
  onClose: () => void;
}

// ── Individual download card ──────────────────────────────────────────────────

function DownloadItem({ job, onDismiss }: { job: DownloadJob; onDismiss: (id: string) => void }) {
  const [live, setLive] = useState<DownloadJob>(job);
  const active = ['starting', 'downloading', 'processing'].includes(live.status);

  useSSE<DownloadJob>(
    active ? `/api/download/${job.id}/events` : null,
    (_, data) => setLive(prev => ({ ...prev, ...data })),
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-elevated">
          <img src={`/api/download/${job.id}/thumb`} className="h-full w-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium text-text-primary">{live.title}</p>
            <div className="flex items-center gap-1 shrink-0">
              <Badge variant={live.status === 'done' ? 'success' : live.status === 'error' ? 'danger' : 'default'} className="capitalize text-xs">
                {live.status}
              </Badge>
              {(live.status === 'done' || live.status === 'error') && (
                <button onClick={() => onDismiss(job.id)} className="text-text-muted hover:text-text-primary p-0.5">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          {active && <Progress value={live.progress} className="mt-1.5" />}
          {active && (
            <p className="mt-0.5 text-xs text-text-muted">
              {live.progress.toFixed(0)}%
              {live.speed && <> · {live.speed}</>}
              {live.eta && <> · ETA {live.eta}</>}
            </p>
          )}
          {live.error && <p className="mt-1 text-xs text-danger line-clamp-2">{live.error}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Per-item row inside a batch ───────────────────────────────────────────────

function BatchItemRow({
  item, batchId, active,
}: { item: BatchItem; batchId: string; active: boolean }) {
  const cancelMutation = useMutation({
    mutationFn: () => downloadsApi.cancelBatchItem(batchId, item.index),
    onError: () => toast.error('Could not cancel item'),
  });

  const isDownloading = item.status === 'downloading';
  const isPending = item.status === 'pending';

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
      isDownloading ? 'bg-elevated' : 'hover:bg-elevated/50'
    }`}>
      {/* Status indicator */}
      <div className="shrink-0 w-4 flex justify-center">
        {item.status === 'done' && <div className="h-2 w-2 rounded-full bg-success" />}
        {item.status === 'error' && <div className="h-2 w-2 rounded-full bg-danger" />}
        {item.status === 'skipped' && <div className="h-2 w-2 rounded-full bg-text-subtle" />}
        {isPending && <div className="h-2 w-2 rounded-full bg-border" />}
        {isDownloading && <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />}
      </div>

      {/* Thumbnail if available */}
      {item.thumbnail && (
        <div className="h-8 w-12 shrink-0 overflow-hidden rounded bg-elevated">
          <img src={item.thumbnail} className="h-full w-full object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}

      {/* Title + progress */}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-xs font-medium ${
          item.status === 'skipped' ? 'text-text-subtle line-through' :
          item.status === 'done' ? 'text-text-secondary' : 'text-text-primary'
        }`}>{item.title}</p>

        {isDownloading && (
          <div className="mt-1 flex items-center gap-2">
            <Progress value={item.progress} className="flex-1 h-1" />
            <span className="shrink-0 text-[10px] text-text-muted whitespace-nowrap">
              {item.progress.toFixed(0)}%
              {item.speed && <> · {item.speed}</>}
              {item.eta && <> · {item.eta}</>}
            </span>
          </div>
        )}

        {item.error && item.status === 'error' && (
          <p className="mt-0.5 truncate text-[10px] text-danger">{item.error}</p>
        )}
      </div>

      {/* Cancel button (pending or downloading) */}
      {active && (isPending || isDownloading) && (
        <button
          onClick={() => cancelMutation.mutate()}
          disabled={cancelMutation.isPending}
          title="Skip this video"
          className="shrink-0 rounded p-0.5 text-text-subtle hover:text-danger hover:bg-danger/10 transition-colors"
        >
          {isDownloading ? <SkipForward className="h-3 w-3" /> : <X className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}

// ── Batch download card ───────────────────────────────────────────────────────

function BatchCard({ job: initialJob, onDismiss }: { job: BatchJob; onDismiss: (id: string) => void }) {
  const [job, setJob] = useState(initialJob);
  const [expanded, setExpanded] = useState(true);
  const active = job.status === 'running' || job.status === 'paused';

  useSSE<BatchJob>(
    active ? `/api/batch/${job.id}/events` : null,
    (_, data) => setJob(prev => ({ ...prev, ...data })),
  );

  const overallPct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  const activeCount = (job.items || []).filter(i => i.status === 'downloading').length;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ListVideo className="h-3.5 w-3.5 shrink-0 text-accent" />
            <p className="truncate text-sm font-medium text-text-primary">{job.title}</p>
            <Badge
              variant={job.status === 'done' ? 'success' : job.status === 'error' ? 'danger' : 'default'}
              className="shrink-0 text-xs capitalize"
            >
              {job.paused ? 'paused' : job.status}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <Progress value={overallPct} className="flex-1 h-1" />
            <span className="shrink-0 text-[11px] text-text-muted whitespace-nowrap">
              {job.done}/{job.total}
              {activeCount > 0 && <> · {activeCount} active</>}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {active && (
            <>
              {job.paused ? (
                <Button size="icon-sm" variant="secondary" onClick={() => downloadsApi.resumeBatch(job.id)} title="Resume">
                  <Play className="h-3 w-3" />
                </Button>
              ) : (
                <Button size="icon-sm" variant="secondary" onClick={() => downloadsApi.pauseBatch(job.id)} title="Pause (lets active downloads finish)">
                  <Pause className="h-3 w-3" />
                </Button>
              )}
              <Button size="icon-sm" variant="danger" onClick={() => downloadsApi.stopBatch(job.id)} title="Stop all">
                <Square className="h-3 w-3" />
              </Button>
            </>
          )}
          {!active && (
            <button onClick={() => onDismiss(job.id)} className="p-0.5 text-text-muted hover:text-text-primary" title="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-0.5 text-text-muted hover:text-text-primary ml-0.5"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Item list */}
      {expanded && (job.items || []).length > 0 && (
        <div className="max-h-72 overflow-y-auto py-1">
          {job.items.map(item => (
            <BatchItemRow
              key={item.index}
              item={item}
              batchId={job.id}
              active={active}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function AddVideosModal({ open, onClose }: AddVideosModalProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [folder, setFolder] = useState('');
  const [concurrency, setConcurrency] = useState(2);
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

  // Restore active batches when the modal opens.
  useEffect(() => {
    if (!open) return;
    downloadsApi.listBatches().then(list => {
      setBatches(prev => {
        const existing = new Set(prev.map(b => b.id));
        const fresh = list.filter(b => !existing.has(b.id));
        return [...prev, ...fresh];
      });
    }).catch(() => {});
  }, [open]);

  const probeMutation = useMutation({
    mutationFn: () => downloadsApi.probePlaylist(url),
    onSuccess: data => {
      setProbe(data);
      setSelected(new Set(data.entries.map(e => e.index)));
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to read playlist'),
  });

  const downloadMutation = useMutation({
    mutationFn: async () => {
      if (isPlaylist && probe) {
        const items = probe.entries
          .filter(e => selected.has(e.index))
          .map(e => ({ index: e.index, title: e.title, url: e.url, thumbnail: e.thumbnail }));
        return downloadsApi.startBatch({ url, folder, title: probe.title, concurrency, items });
      }
      return downloadsApi.start(url, folder);
    },
    onSuccess: (data: any) => {
      if ('id' in data) {
        if (isPlaylist && probe) {
          const items = probe.entries
            .filter(e => selected.has(e.index))
            .map(e => ({
              index: e.index, title: e.title,
              url: e.url, thumbnail: e.thumbnail,
              status: 'pending' as const, progress: 0,
            }));
          setBatches(prev => [...prev, {
            id: data.id, title: probe.title, status: 'running',
            paused: false, done: 0, total: items.length, concurrency, items,
          }]);
        } else {
          setJobs(prev => [...prev, {
            id: data.id, url, title: 'Downloading…',
            status: 'starting', progress: 0, folder, startedAt: Date.now(),
          }]);
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

  const activeCount = jobs.length + batches.length;

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
                    onChange={e => {
                      setUrl(e.target.value);
                      if (autoDetectPlaylist(e.target.value)) setIsPlaylist(true);
                      setProbe(null);
                    }}
                    placeholder="https://youtube.com/watch?v=… or playlist URL"
                    onKeyDown={e => {
                      if (e.key === 'Enter')
                        isPlaylist ? probeMutation.mutate() : downloadMutation.mutate();
                    }}
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

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPlaylist}
                      onChange={e => { setIsPlaylist(e.target.checked); setProbe(null); }}
                      className="rounded accent-accent"
                    />
                    This is a playlist
                  </label>

                  {isPlaylist && (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <span>Parallel downloads:</span>
                      {[1, 2, 3].map(n => (
                        <button
                          key={n}
                          onClick={() => setConcurrency(n)}
                          className={`h-6 w-6 rounded text-xs font-medium transition-colors ${
                            concurrency === n
                              ? 'bg-accent text-white'
                              : 'bg-elevated hover:bg-border text-text-secondary'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {probe && (
                  <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                      <p className="text-sm font-medium text-text-primary">{probe.title}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">{selected.size}/{probe.entries.length} selected</span>
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
                            onChange={e => setSelected(prev => {
                              const s = new Set(prev);
                              e.target.checked ? s.add(entry.index) : s.delete(entry.index);
                              return s;
                            })}
                            className="rounded accent-accent shrink-0"
                          />
                          {entry.thumbnail && (
                            <div className="h-7 w-12 shrink-0 overflow-hidden rounded bg-elevated">
                              <img src={entry.thumbnail} className="h-full w-full object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                          )}
                          <span className="flex-1 truncate text-sm text-text-primary">{entry.title}</span>
                          {entry.duration && (
                            <span className="text-xs text-text-muted shrink-0">
                              {Math.floor(entry.duration / 60)}:{String(Math.floor(entry.duration % 60)).padStart(2, '0')}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                    <div className="border-t border-border px-4 py-3">
                      <Button
                        onClick={() => downloadMutation.mutate()}
                        disabled={!selected.size || downloadMutation.isPending}
                        className="w-full"
                      >
                        {downloadMutation.isPending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Play className="h-4 w-4" />}
                        Download {selected.size} {selected.size === 1 ? 'video' : 'videos'}
                        {concurrency > 1 && ` (${concurrency} at a time)`}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'upload' && (
              <div className="space-y-3">
                <div
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-10 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
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
                      {uploadProgress !== null
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {uploadProgress}%</>
                        : <><Upload className="h-4 w-4" /> Upload</>}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Active downloads */}
            {activeCount > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-subtle">
                  Downloads {activeCount > 0 && `· ${activeCount} active`}
                </p>
                {jobs.map(j => (
                  <DownloadItem
                    key={j.id}
                    job={j}
                    onDismiss={id => { downloadsApi.dismiss(id); setJobs(prev => prev.filter(x => x.id !== id)); }}
                  />
                ))}
                {batches.map(b => (
                  <BatchCard
                    key={b.id}
                    job={b}
                    onDismiss={id => { downloadsApi.dismissBatch(id); setBatches(prev => prev.filter(x => x.id !== id)); }}
                  />
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
