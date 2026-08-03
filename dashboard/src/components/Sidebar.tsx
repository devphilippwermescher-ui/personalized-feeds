import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { User } from 'firebase/auth';
import type { IconType } from 'react-icons';
import {
  HiOutlineArrowRightOnRectangle,
  HiOutlineChatBubbleLeft,
  HiOutlineCog6Tooth,
  HiOutlineCreditCard,
  HiOutlineDocumentText,
  HiOutlineKey,
  HiOutlineRss,
  HiOutlineUser,
} from 'react-icons/hi2';
import projectLogo from '../../../extension/src/icons/icon48.png';

interface SidebarProps {
  user: User;
  onLogout: () => void;
}

interface SidebarNavItem {
  to: string;
  label: string;
  icon: IconType;
  end?: boolean;
}

interface SidebarNavSection {
  label: string;
  items: SidebarNavItem[];
}

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const [avatarError, setAvatarError] = useState(false);

  const navSections: SidebarNavSection[] = [
    {
      label: 'Analytics',
      items: [
        { to: '/analytics/profile', label: 'Profile Analytics', icon: HiOutlineUser },
        { to: '/analytics/content', label: 'Content Analytics', icon: HiOutlineDocumentText },
        { to: '/analytics/comments', label: 'Comment Analytics', icon: HiOutlineChatBubbleLeft },
      ],
    },
    {
      label: 'Settings',
      items: [
        { to: '/settings/profile', label: 'Manage account', icon: HiOutlineCog6Tooth },
        { to: '/subscription', label: 'Subscription', icon: HiOutlineCreditCard },
        { to: '/settings/api-extension', label: 'API & Extension', icon: HiOutlineKey },
      ],
    },
    {
      label: 'Feeds',
      items: [{ to: '/', label: 'Feeds', icon: HiOutlineRss, end: true }],
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src={projectLogo} alt="myFeedPilot" className="brand-logo brand-logo-sidebar" />
          <span>myFeedPilot</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navSections.map((section) => (
          <div className="sidebar-nav-section" key={section.label}>
            <div className="sidebar-nav-section-label">{section.label}</div>
            <div className="sidebar-nav-section-items">
              {section.items.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    end={item.end}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          {user.photoURL && !avatarError ? (
            <img src={user.photoURL} alt="" className="sidebar-avatar" onError={() => setAvatarError(true)} />
          ) : (
            <div className="sidebar-avatar sidebar-avatar-fallback">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="#9ca3af">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
          )}
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{user.displayName || 'User'}</span>
            <span className="sidebar-user-email">{user.email}</span>
          </div>
        </div>
        <button className="sidebar-logout" onClick={onLogout} title="Sign out">
          <HiOutlineArrowRightOnRectangle />
        </button>
      </div>
    </aside>
  );
}
