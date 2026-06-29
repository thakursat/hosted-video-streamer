export interface AppConfig {
  port: number;
  email: string;
  passwordHash: string;
  mediaDir: string;
  proxy?: string;
  updateUrl?: string;
}

export interface VideoItem {
  id: string;
  name: string;
  ext: string;
  relPath: string;
  absPath: string;
  folder: string;
  size: number;
  addedAt: number;
  duration?: number;
  width?: number;
  height?: number;
}

export interface FolderTree {
  name: string;
  path: string;
  videoCount: number;
  totalCount: number;
  children: FolderTree[];
}

export type DownloadStatus = 'starting' | 'downloading' | 'processing' | 'done' | 'error';
export type BatchStatus = 'running' | 'paused' | 'done' | 'stopped' | 'error';
export type BatchItemStatus = 'pending' | 'downloading' | 'done' | 'error' | 'skipped';

export interface DownloadJob {
  id: string;
  url: string;
  title: string;
  uploader?: string;
  status: DownloadStatus;
  progress: number;
  speed?: string;
  eta?: string;
  folder: string;
  thumbUrl?: string;
  error?: string;
  startedAt: number;
}

export interface BatchItem {
  index: number;
  title: string;
  url?: string;
  status: BatchItemStatus;
  progress: number;
  error?: string;
}

export interface BatchJob {
  id: string;
  url: string;
  title: string;
  folder: string;
  items: BatchItem[];
  done: number;
  total: number;
  status: BatchStatus;
  paused: boolean;
  startedAt: number;
  archive: string;
  _proc?: import('child_process').ChildProcess;
  _subs?: Set<import('express').Response>;
  _stopReq?: boolean;
}

export interface PlaylistEntry {
  index: number;
  title: string;
  url?: string;
  duration?: number;
  thumbnail?: string;
}

export interface PlaylistProbeResult {
  title: string;
  count: number;
  entries: PlaylistEntry[];
}

export interface YtDlpVersionInfo {
  current: string | null;
  latest: string | null;
  outdated: boolean;
}

export interface ServerStats {
  videos: number;
  libraryBytes: number;
  disk?: { used: number; total: number };
  mem?: { used: number; total: number };
  cpu: { count: number; load: number[] };
  uptime: { process: number; system: number };
  node: string;
  platform: string;
  activeDownloads: number;
  ytdlp?: YtDlpVersionInfo;
}
