import React from 'react';
import {CalendarClock, ClipboardList, Home, User, Wallet} from 'lucide-react';
import type {NavTab} from '../types/hatly';

interface BottomNavProps {
  activeTab: NavTab;
  activeOrdersCount: number;
  onChangeTab: (tab: NavTab) => void;
}

const NAV_ITEMS: {id: NavTab; label: string; icon: React.FC<{className?: string}>}[] = [
  {id: 'home', label: 'الرئيسية', icon: Home},
  {id: 'shifts', label: 'وردياتي', icon: CalendarClock},
  {id: 'orders', label: 'طلباتي', icon: ClipboardList},
  {id: 'wallet', label: 'محفظتي', icon: Wallet},
  {id: 'profile', label: 'حسابي', icon: User},
];

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  activeOrdersCount,
  onChangeTab,
}) => {
  return (
    <nav
      aria-label="التنقل السفلي"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe md:hidden"
    >
      <div className="grid grid-cols-5 items-center h-16 max-w-lg mx-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              className={`relative min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                isActive ? 'text-[#FF7B00]' : 'text-slate-500 hover:text-[#0A192F]'
              }`}
            >
              <div className="relative">
                <Icon className="h-[21px] w-[21px]" />
                {item.id === 'orders' && activeOrdersCount > 0 && (
                  <span className="absolute -top-1.5 -left-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#0A192F] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {activeOrdersCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold tracking-tight whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
