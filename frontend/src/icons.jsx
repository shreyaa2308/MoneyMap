const paths = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  transactions: (
    <>
      <path d="M8 7h12M8 12h12M8 17h8" />
      <path d="M4 7h.01M4 12h.01M4 17h.01" />
    </>
  ),
  accounts: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10.5h18" />
      <path d="M7 15h4" />
    </>
  ),
  investments: (
    <>
      <path d="M4 19V5M4 19h16" />
      <path d="M7.5 14.5 11 11l2.8 2.2L18 8" />
    </>
  ),
  bills: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5V6M16 3.5V6M4 10h16" />
    </>
  ),
  assistant: (
    <>
      <path d="M7.5 18.2 5 20.5V7.4A2.4 2.4 0 0 1 7.4 5h9.2A2.4 2.4 0 0 1 19 7.4v6.2a2.4 2.4 0 0 1-2.4 2.4H7.5Z" />
      <path d="M8.5 9.2h7M8.5 12.4h4.5" />
    </>
  ),
  logout: (
    <>
      <path d="M10 7V5.8A1.8 1.8 0 0 1 11.8 4h6.4A1.8 1.8 0 0 1 20 5.8v12.4a1.8 1.8 0 0 1-1.8 1.8h-6.4A1.8 1.8 0 0 1 10 18.2V17" />
      <path d="M4 12h10M11 8.5 14.5 12 11 15.5" />
    </>
  ),
  chevron: <path d="M14.5 6.5 9 12l5.5 5.5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chat: (
    <>
      <path d="M7.5 18.2 5 20.5V7.4A2.4 2.4 0 0 1 7.4 5h9.2A2.4 2.4 0 0 1 19 7.4v6.2a2.4 2.4 0 0 1-2.4 2.4H7.5Z" />
      <path d="M8.5 9.2h7M8.5 12.4h4.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M19 12a7 7 0 1 1-1.7-4.6" />
      <path d="M19 5.5V9h-3.5" />
    </>
  ),
}

export function Icon({ name, size = 20, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || null}
    </svg>
  )
}

export function BrandMark({ className = '' }) {
  return <span className={`brand-mark ${className}`.trim()}>M</span>
}
