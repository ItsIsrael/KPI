import type { StateCreator } from "zustand";
import type { UiSliceState, FullProductionStoreState } from "./types";
import type { AuthUserProfile } from "@/lib/auth";
import { signOutSupabase } from "@/lib/auth";

export const createUiSlice: StateCreator<
  FullProductionStoreState,
  [],
  [],
  UiSliceState
> = (set) => ({
  showCalculator: false,
  showTransitionBanner: false,
  showSplitView: false,
  iframeUrl: "https://isra.dev",
  bookmarks: [
    { id: "bk-1", label: "Portal Vegaindus", url: "http://portalindustrial.vegaindus.com" },
  ],
  highContrastMode: false,
  goldMode: false,
  soundEnabled: false,
  palletSpeeds: [],
  ambientMode: false,
  editingQueueItemId: null,
  authUser: null,
  isLoggedIn: false,
  currentUser: null,
  customDayLabelIndex: null,
  isScreenLocked: false,

  toggleCalculator: () =>
    set((state) => ({ showCalculator: !state.showCalculator })),

  hideTransitionBanner: () =>
    set({ showTransitionBanner: false }),

  toggleSplitView: () =>
    set((state) => ({ showSplitView: !state.showSplitView })),

  setIframeUrl: (url: string) =>
    set({ iframeUrl: url }),

  addBookmark: (label: string, url: string) =>
    set((state) => ({
      bookmarks: [
        ...state.bookmarks,
        { id: `bk-${Date.now()}`, label, url },
      ],
    })),

  removeBookmark: (id: string) =>
    set((state) => ({
      bookmarks: state.bookmarks.filter((b) => b.id !== id),
    })),

  toggleHighContrastMode: () =>
    set((state) => ({ highContrastMode: !state.highContrastMode })),

  toggleGoldMode: () =>
    set((state) => ({ goldMode: !state.goldMode })),

  toggleSoundEnabled: () =>
    set((state) => ({ soundEnabled: !state.soundEnabled })),

  toggleAmbientMode: () =>
    set((state) => ({ ambientMode: !state.ambientMode })),

  setEditingQueueItemId: (id: string | null) =>
    set({ editingQueueItemId: id }),

  setAuthUser: (user: AuthUserProfile | null) =>
    set({
      authUser: user,
      isLoggedIn: Boolean(user),
      currentUser: user ? user.username : null,
    }),

  logout: async () => {
    try {
      await signOutSupabase();
    } catch (e) {
      console.error("Error signing out:", e);
    }
    set({
      authUser: null,
      isLoggedIn: false,
      currentUser: null,
    });
  },

  setCustomDayLabelIndex: (index: number | null) =>
    set({ customDayLabelIndex: index }),

  toggleScreenLock: () =>
    set((state) => ({ isScreenLocked: !state.isScreenLocked })),
});
