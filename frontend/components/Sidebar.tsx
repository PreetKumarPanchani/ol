// components/Sidebar.tsx
import { useState, forwardRef, ForwardedRef } from 'react';
import {
  MessageSquare,
  FileText,
  Search,
  Settings,
  HelpCircle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  User
} from 'lucide-react';
import { NavItem } from '@/types/index';

interface SidebarProps {
  isOpen: boolean;
  activeView: string;
  setActiveView: (view: string) => void;
}

const Sidebar = forwardRef<HTMLDivElement, SidebarProps>(({ isOpen, activeView, setActiveView }, ref) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    if (expandedSection === section) {
      setExpandedSection(null);
    } else {
      setExpandedSection(null);
    }
  };

  const navItems: NavItem[] = [
    { id: 'chat', label: 'Legal Assistant', icon: MessageSquare },
    { id: 'upload', label: 'Documents', icon: FileText },
    { id: 'search', label: 'Case Law', icon: Search },
    { id: 'legislation', label: 'Legislation', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (itemId: string) => {
    // Map navigation items to views
    if (itemId === 'chat') setActiveView('chat');
    else if (itemId === 'upload') setActiveView('upload');
    else if (itemId === 'search') setActiveView('search');
    else if (itemId === 'legislation') setActiveView('legislation');
    else if (itemId === 'settings') setActiveView('settings');
  };

  return (
    <div 
      ref={ref}
      className={`
        bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
        transform top-0 left-0 bottom-0 z-40 fixed md:relative
        transition-transform duration-300 ease-in-out
        w-64 flex flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-20'}
      `}
    >
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="px-2 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`
                w-full flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors
                ${activeView === item.id
                  ? 'bg-legal-gold/20 text-legal-navy dark:text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }
              `}
            >
              <item.icon className="h-5 w-5 mr-3 flex-shrink-0" />
              <span className={isOpen ? 'block' : 'hidden md:hidden'}>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-legal-gold flex items-center justify-center">
              <User className="h-6 w-6 text-legal-navy" />
            </div>
          </div>
          <div className={`ml-3 ${isOpen ? 'block' : 'hidden md:hidden'}`}>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Legal Professional</p>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">View profile</p>
          </div>
        </div>
      </div>
    </div>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;