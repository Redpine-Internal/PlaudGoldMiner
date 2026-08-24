import { create } from 'zustand';

export interface CloneMsg {
  role: 'user' | 'clone';
  text: string;
}

export interface CloneChat {
  id: number;
  title: string;
  seed: string | null;
  msgs: CloneMsg[] | null;
}

interface AppState {
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  selectedOpportunityId: string | null;
  setSelectedOpportunityId: (id: string | null) => void;

  // Shell
  menuCollapsed: boolean;
  toggleMenu: () => void;

  // Clone chat sessions
  chats: CloneChat[];
  activeChatId: number;
  newChat: (title?: string, seed?: string | null) => number;
  selectChat: (id: number) => void;
  saveChatMsgs: (id: number, msgs: CloneChat['msgs'], autoTitle?: string) => void;
}

let _nextChatId = 2;

export const useAppStore = create<AppState>((set) => ({
  selectedConversationId: null,
  setSelectedConversationId: (id) => set({ selectedConversationId: id }),
  selectedOpportunityId: null,
  setSelectedOpportunityId: (id) => set({ selectedOpportunityId: id }),

  menuCollapsed: false,
  toggleMenu: () => set((s) => ({ menuCollapsed: !s.menuCollapsed })),

  chats: [{ id: 1, title: 'Novo chat', seed: null, msgs: null }],
  activeChatId: 1,
  newChat: (title, seed) => {
    const id = _nextChatId++;
    set((s) => ({
      chats: [{ id, title: title || 'Novo chat', seed: seed || null, msgs: null }, ...s.chats],
      activeChatId: id,
    }));
    return id;
  },
  selectChat: (id) => set({ activeChatId: id }),
  saveChatMsgs: (id, msgs, autoTitle) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === id ? { ...c, msgs, title: c.title === 'Novo chat' && autoTitle ? autoTitle : c.title } : c
      ),
    })),
}));
