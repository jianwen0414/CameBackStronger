import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = ({ className, label, ...props }: InputProps) => {
  return (
    <div className="w-full space-y-2">
      {label && (
        <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">
          {label}
        </label>
      )}
      <div className="relative group">
        <input
          className={twMerge(
            "w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all duration-300",
            className
          )}
          {...props}
        />
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500 -z-10 blur-xl" />
      </div>
    </div>
  );
};
