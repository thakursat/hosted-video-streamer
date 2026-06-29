import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Film, Search } from 'lucide-react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { VideoCard } from '@/components/VideoCard';
import { Player } from '@/components/Player';
import { AddVideosModal } from '@/components/AddVideosModal';
import { StatsModal } from '@/components/StatsModal';
import { AccountModal } from '@/components/AccountModal';
import { videosApi } from '@/api/videos';
import { usePlayerStore } from '@/stores/playerStore';
import type { Video } from '@/types';

type SortKey = 'addedAt' | 'name' | 'size' | 'duration';

export function Library() {
  const qc = useQueryClient();
  const { video: nowPlaying, open: openPlayer } = usePlayerStore();

  const [folder, setFolder] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('addedAt');
  const [showAdd, setShowAdd] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['videos', folder],
    queryFn: () => videosApi.list(folder),
    staleTime: 10_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => videosApi.delete(ids),
    onSuccess: () => {
      toast.success('Deleted');
      qc.invalidateQueries({ queryKey: ['videos'] });
      qc.invalidateQueries({ queryKey: ['tree'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  const filtered = useMemo(() => {
    let result = videos;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(v => v.name.toLowerCase().includes(q) || v.folder.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'size') return b.size - a.size;
      if (sort === 'duration') return (b.duration || 0) - (a.duration || 0);
      return b.addedAt - a.addedAt;
    });
  }, [videos, search, sort]);

  const handlePlay = (video: Video) => openPlayer(video, filtered);

  const handleDelete = (video: Video) => {
    if (!confirm(`Delete "${video.name}"?`)) return;
    deleteMutation.mutate([video.id]);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        onAddVideos={() => setShowAdd(true)}
        onStats={() => setShowStats(true)}
        onAccount={() => setShowAccount(true)}
        videoCount={videos.length}
        search={search}
        onSearch={setSearch}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar selected={folder} onSelect={setFolder} />

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6">
            {/* Toolbar */}
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-text-primary">
                  {folder || 'All videos'} · {filtered.length}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted">Sort</label>
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value as SortKey)}
                  className="rounded-lg border border-border bg-elevated px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="addedAt">Newest</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                  <option value="duration">Duration</option>
                </select>
              </div>
            </div>

            {/* Grid */}
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border border-border bg-surface">
                    <div className="aspect-video animate-pulse bg-elevated" />
                    <div className="p-3 space-y-2">
                      <div className="h-3.5 rounded bg-elevated animate-pulse" />
                      <div className="h-2.5 w-1/2 rounded bg-elevated animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                {search ? (
                  <>
                    <Search className="mb-3 h-10 w-10 text-text-subtle" />
                    <p className="text-sm font-medium text-text-primary">No results for "{search}"</p>
                    <p className="mt-1 text-xs text-text-muted">Try a different search term</p>
                  </>
                ) : (
                  <>
                    <Film className="mb-3 h-10 w-10 text-text-subtle" />
                    <p className="text-sm font-medium text-text-primary">No videos here</p>
                    <p className="mt-1 text-xs text-text-muted">Add videos using the button above</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {filtered.map(video => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    onPlay={handlePlay}
                    onRename={v => {
                      const name = prompt('New name:', v.name);
                      if (name && name !== v.name) {
                        videosApi.rename(v.id, name)
                          .then(() => { toast.success('Renamed'); qc.invalidateQueries({ queryKey: ['videos'] }); })
                          .catch(() => toast.error('Rename failed'));
                      }
                    }}
                    onDelete={handleDelete}
                    onMove={v => {
                      const dest = prompt('Move to folder (leave blank for root):', v.folder);
                      if (dest !== null) {
                        videosApi.move([v.id], dest)
                          .then(() => { toast.success('Moved'); qc.invalidateQueries({ queryKey: ['videos'] }); qc.invalidateQueries({ queryKey: ['tree'] }); })
                          .catch(() => toast.error('Move failed'));
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Overlays */}
      {nowPlaying && <Player />}
      <AddVideosModal open={showAdd} onClose={() => setShowAdd(false)} />
      <StatsModal open={showStats} onClose={() => setShowStats(false)} />
      <AccountModal open={showAccount} onClose={() => setShowAccount(false)} />
    </div>
  );
}
