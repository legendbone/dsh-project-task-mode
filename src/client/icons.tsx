import type { SVGProps } from 'react'

type IconProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & { size?: number }

function base({ size = 16, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  }
}

export function IconPlus(props: IconProps) {
  return <svg {...base(props)}><path d="M12 5v14M5 12h14" /></svg>
}

export function IconSearch(props: IconProps) {
  return <svg {...base(props)}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.2 4.2" /></svg>
}

export function IconRefresh(props: IconProps) {
  return <svg {...base(props)}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></svg>
}

export function IconClose(props: IconProps) {
  return <svg {...base(props)}><path d="M6 6l12 12M18 6 6 18" /></svg>
}

export function IconChevronDown(props: IconProps) {
  return <svg {...base(props)}><path d="m6 9.5 6 6 6-6" /></svg>
}

export function IconFolder(props: IconProps) {
  return <svg {...base(props)}><path d="M3.5 7.5a2 2 0 0 1 2-2h3.4l1.7 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>
}

export function IconBoard(props: IconProps) {
  return <svg {...base(props)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="M9 4.5v15M15 4.5v9" />
  </svg>
}

export function IconPlay(props: IconProps) {
  return <svg {...base(props)}><path d="M9 6.8v10.4a.7.7 0 0 0 1.07.6l8.1-5.2a.7.7 0 0 0 0-1.2l-8.1-5.2A.7.7 0 0 0 9 6.8Z" fill="currentColor" stroke="none" /></svg>
}

export function IconArrowRight(props: IconProps) {
  return <svg {...base(props)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
}

export function IconClock(props: IconProps) {
  return <svg {...base(props)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
}

export function IconMessage(props: IconProps) {
  return <svg {...base(props)}><path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4 20l1-4.6A7.5 7.5 0 1 1 20 12.5Z" /><path d="M9 11.5h6M9 14.5h4" /></svg>
}

export function IconAlert(props: IconProps) {
  return <svg {...base(props)}><path d="M12 4.5 21 20H3z" /><path d="M12 9.5v5M12 17.2v.3" /></svg>
}

export function IconCheck(props: IconProps) {
  return <svg {...base(props)}><path d="m5 12.5 4.5 4.5L19 7" /></svg>
}


export function IconInbox(props: IconProps) {
  return <svg {...base(props)}>
    <path d="M4 13.5 6.2 5.7A2 2 0 0 1 8.1 4.3h7.8a2 2 0 0 1 1.9 1.4L20 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    <path d="M4 13.5h4.2l1.3 2.2h5l1.3-2.2H20" />
  </svg>
}


export function IconLayers(props: IconProps) {
  return <svg {...base(props)}><path d="m12 3.8 8 4.2-8 4.2-8-4.2z" /><path d="m4 12.2 8 4.2 8-4.2" /><path d="m4 16.2 8 4.2 8-4.2" /></svg>
}

export function IconChevronRight(props: IconProps) {
  return <svg {...base(props)}><path d="m9.5 6 6 6-6 6" /></svg>
}

export function IconEdit(props: IconProps) {
  return <svg {...base(props)}><path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10z" /><path d="m14 6.5 3 3" /></svg>
}


export function IconUndo(props: IconProps) {
  return <svg {...base(props)}><path d="M9 8H4V3" /><path d="M4.6 8a8 8 0 1 1-1.4 7" /></svg>
}

