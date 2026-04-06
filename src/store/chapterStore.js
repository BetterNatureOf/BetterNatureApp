import { create } from 'zustand';

const useChapterStore = create((set) => ({
  chapters: [],
  currentChapter: null,
  loading: false,

  setChapters: (chapters) => set({ chapters }),
  setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
  setLoading: (loading) => set({ loading }),
}));

export default useChapterStore;
