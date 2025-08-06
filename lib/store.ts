import { create } from 'zustand'

interface SidebarStore {
  isOpen: boolean
  isMobile: boolean
  toggle: () => void
  setOpen: (open: boolean) => void
  setMobile: (mobile: boolean) => void
}

export const useSidebar = create<SidebarStore>((set) => ({
  isOpen: false, // Default closed to prevent mobile issues
  isMobile: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  setMobile: (mobile) => set({ isMobile: mobile }),
}))
