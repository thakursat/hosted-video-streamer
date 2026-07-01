import { create } from 'zustand';
import type { Video } from '../types';

interface PlayerState {
  video: Video | null;
  playlist: Video[];
  open: (video: Video, playlist?: Video[]) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  // Drop the current video from the playlist and advance to the next one
  // (or previous, or close if it was the only item). Used after deleting.
  removeCurrent: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  video: null,
  playlist: [],

  open: (video, playlist = []) => set({ video, playlist }),

  close: () => set({ video: null }),

  next: () => {
    const { video, playlist } = get();
    if (!video || !playlist.length) return;
    const idx = playlist.findIndex(v => v.id === video.id);
    const next = playlist[idx + 1];
    if (next) set({ video: next });
  },

  prev: () => {
    const { video, playlist } = get();
    if (!video || !playlist.length) return;
    const idx = playlist.findIndex(v => v.id === video.id);
    const prev = playlist[idx - 1];
    if (prev) set({ video: prev });
  },

  removeCurrent: () => {
    const { video, playlist } = get();
    if (!video) return;
    const idx = playlist.findIndex(v => v.id === video.id);
    const rest = playlist.filter(v => v.id !== video.id);
    // After removal, the item previously at idx+1 sits at idx; fall back to the
    // previous item, then to null (closes the player) when nothing is left.
    const nextVideo = rest[idx] ?? rest[idx - 1] ?? null;
    set({ playlist: rest, video: nextVideo });
  },
}));
