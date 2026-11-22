import React from 'react';

interface HatlyLogoProps {
  size?: 'sm' | 'md' | 'lg';
  light?: boolean;
}

export const HatlyLogo: React.FC<HatlyLogoProps> = ({size = 'md', light = false}) => {
  const iconDims =
    size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-16 w-16' : 'h-10 w-10';
  const textSize =
    size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div className="inline-flex items-center gap-2.5 shrink-0 whitespace-nowrap">
      <div
        className={`${iconDims} rounded-xl bg-white p-0.5 flex items-center justify-center border border-slate-200/80 shadow-xs overflow-hidden shrink-0`}
      >
        <img
          src="/pwa-192x192.png"
          alt="شعار هاتلي"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
        />
      </div>
      <span
        className={`${textSize} font-extrabold tracking-tight ${
          light ? 'text-white' : 'text-[#0A192F]'
        }`}
      >
        هاتلي
      </span>
    </div>
  );
};
