'use client'

const MenuIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
)

export default function Navbar({ onMenuClick }) {
    return (
        <header className="mobile-header">
            <div className="sidebar-logo">
                <div className="sidebar-logo-icon" style={{ width: '32px', height: '32px', fontSize: '14px' }}>E</div>
                <span className="sidebar-logo-text" style={{ fontSize: '16px' }}>Elesco</span>
            </div>
            <button className="menu-toggle" onClick={onMenuClick} aria-label="Åpne meny">
                <MenuIcon />
            </button>
        </header>
    )
}
