// components/Layout.tsx
import { useState, useEffect, ReactNode, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import MobileNav from '@/components/MobileNav';

interface LayoutProps {
  children: ReactNode;
  activeView: string;
  setActiveView: (view: string) => void;
}

export default function Layout({ children, activeView, setActiveView }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle click outside sidebar on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isMobile && sidebarOpen && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setSidebarOpen(false);
      }
    };

    // Handle touch events for mobile
    const handleTouchOutside = (event: TouchEvent) => {
      if (isMobile && sidebarOpen && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setSidebarOpen(false);
      }
    };

    if (isMobile && sidebarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleTouchOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleTouchOutside);
    };
  }, [isMobile, sidebarOpen]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Close sidebar when navigation item is clicked on mobile
  const handleViewChange = (view: string) => {
    setActiveView(view);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header toggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay for sidebar */}
        {isMobile && sidebarOpen && (
          <div 
            className="sidebar-mobile-overlay active"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        <Sidebar 
          ref={sidebarRef}
          isOpen={sidebarOpen} 
          activeView={activeView} 
          setActiveView={handleViewChange} 
        />
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 transition-all duration-300">
          <div className="container mx-auto p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
      {isMobile && <MobileNav activeView={activeView} setActiveView={handleViewChange} />}
    </div>
  );
}