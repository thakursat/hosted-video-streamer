import { create } from 'zustand';
import type { Video } from '../types';

interface PlayerState {
  video: Video | null;
  playlist: Video[];
  open: (video: Video, playlist?: Video[]) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
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
}));
