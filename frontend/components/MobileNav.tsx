// components/MobileNav.tsx
import {
  MessageSquare,
  FileText,
  Search,
  BookOpen,
  Settings
} from 'lucide-react';

interface MobileNavProps {
  activeView: string;
  setActiveView: (view: string) => void;
}

export default function MobileNav({ activeView, setActiveView }: MobileNavProps) {
  const navItems = [
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'upload', icon: FileText, label: 'Docs' },
    { id: 'search', icon: Search, label: 'Cases' },
    { id: 'legislation', icon: BookOpen, label: 'Laws' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  const handleNavClick = (viewId: string) => {
    setActiveView(viewId);
  };

  return (
    <div className="mobile-nav">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => handleNavClick(item.id)}
          className={`mobile-nav-item ${activeView === item.id ? 'active' : ''}`}
        >
          <item.icon className="h-5 w-5" />
          <span className="text-xs mt-1">{item.label}</span>
        </button>
      ))}
    </div>
  );
}