// components/Sidebar.tsx
import { useState } from 'react';
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
}

export default function Sidebar({ isOpen }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<string>('chat');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    if (expandedSection === section) {
      setExpandedSection(null);
    } else {
      setExpandedSection(section);
    }
  };

  const navItems: NavItem[] = [
    { id: 'chat', label: 'Legal Assistant', icon: MessageSquare },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'cases', label: 'Case Law', icon: Search },
    { id: 'statutes', label: 'Statutes', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // const recentCases: string[] = [];

  // const savedSearches: string[] = [ ];

  return (
    <div className={`
      bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
      transform top-0 left-0 bottom-0 z-40 fixed md:relative
      transition-transform duration-300 ease-in-out
      w-64 flex flex-col
      ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-20'}
    `}>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="px-2 space-y-1">
          {navItems.map((item) => (
            <a
              key={item.id}
              href="#"
              className={`
                flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors
                ${activeTab === item.id
                  ? 'bg-legal-gold/20 text-legal-navy dark:text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }
              `}
              onClick={() => setActiveTab(item.id)}
            >
              <item.icon className="h-5 w-5 mr-3 flex-shrink-0" />
              <span className={isOpen ? 'block' : 'hidden md:hidden'}>{item.label}</span>
            </a>
          ))}
        </nav>

        {/*
        <div className="mt-8 px-3">
          <button
            className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => toggleSection('recent')}
          >
            <span className={isOpen ? 'block' : 'hidden md:hidden'}>Recent Cases</span>
            {expandedSection === 'recent' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          
          {expandedSection === 'recent' && (
            <div className="pl-4 mt-1 space-y-1">
              {recentCases.map((caseName, index) => (
                <a
                  key={index}
                  href="#"
                  className="block px-3 py-2 text-xs text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 truncate"
                >
                  {caseName}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 px-3">
          <button
            className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => toggleSection('searches')}
          >
            <span className={isOpen ? 'block' : 'hidden md:hidden'}>Saved Searches</span>
            {expandedSection === 'searches' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          
          {expandedSection === 'searches' && (
            <div className="pl-4 mt-1 space-y-1">
              {savedSearches.map((search, index) => (
                <a
                  key={index}
                  href="#"
                  className="block px-3 py-2 text-xs text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 truncate"
                >
                  {search}
                </a>
              ))}
            </div>
          )}
        </div>
      */}
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-legal-gold flex items-center justify-center">
              <User className="h-6 w-6 text-legal-navy" />
            </div>
          </div>
          <div className={`ml-3 ${isOpen ? 'block' : 'hidden md:hidden'}`}>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Attorney Name</p>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">View profile</p>
          </div>
        </div>
      </div>
    </div>
  );
}