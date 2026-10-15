import type { NoteKind } from '@cytoid/notes'
import { KIND_LABEL, NOTE_KINDS } from '@cytoid/notes'

export interface SidebarLink {
  title: string
  path: string
}

export interface SidebarFamily {
  label: string
  links: SidebarLink[]
}

export interface SidebarSection {
  label: string
  links: SidebarLink[]
  families?: SidebarFamily[]
}

function kindLink(kind: NoteKind): SidebarLink {
  return { title: KIND_LABEL[kind], path: `/notes/inspector/${kind}` }
}

// grouped the way Cytoid classifies note types: classic notes carry over
// from Cytus, extend notes are Cytoid additions, drop notes fall from above
export const sidebarSections: SidebarSection[] = [
  {
    label: 'Notes',
    links: [
      { title: 'Overview', path: '/notes' },
      { title: 'Palette', path: '/notes/palette' },
      { title: 'Judgement', path: '/notes/judgement' },
    ],
    families: [
      { label: 'Classic', links: [kindLink('click'), kindLink('hold'), kindLink('drag-head'), kindLink('drag-child')] },
      { label: 'Extend', links: [kindLink('long-hold'), kindLink('flick'), kindLink('click-drag-head'), kindLink('click-drag-child')] },
      { label: 'Drop', links: [kindLink('drop-click'), kindLink('drop-drag')] },
    ],
  },
  {
    label: 'Player',
    links: [
      { title: 'Chart player', path: '/player' },
    ],
  },
]

export function isKindPath(path: string): path is `/notes/inspector/${NoteKind}` {
  return (NOTE_KINDS as readonly string[]).some(kind => path === `/notes/inspector/${kind}`)
}
