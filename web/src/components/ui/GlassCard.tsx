import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  borderGlow?: boolean;
}

export const GlassCard = ({ children, className, borderGlow = false, ...props }: GlassCardProps) => {
  return (
    <div
      className={twMerge(
        "bg-[rgba(20,20,25,0.6)] backdrop-blur-[20px] border border-white/10 rounded-2xl p-6",
        borderGlow && "hover:border-cyan-500/30 transition-colors duration-300",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
