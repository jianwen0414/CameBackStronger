import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { GlassCard } from '../components/ui/GlassCard';
import { Shield, Activity, Users, Lock } from 'lucide-react';

interface LandingProps {
  onEnter: () => void;
}

export const Landing = ({ onEnter }: LandingProps) => {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black flex flex-col items-center justify-center">
      {/* Background Beams & Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-cyan-500 opacity-20 blur-[100px]"></div>
      <div className="absolute right-0 bottom-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-purple-500 opacity-20 blur-[100px]"></div>

      {/* Hero Content */}
      <div className="z-10 flex flex-col items-center text-center max-w-4xl px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-6"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-900/10 text-cyan-400 text-xs font-mono uppercase tracking-widest mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            System Online
          </div>
          
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-white mb-6">
            THE CITY IS <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-600">WATCHING.</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-400 font-light max-w-2xl mx-auto mb-10">
            AI-Powered Urban Resilience Ecosystem.
            <br />
            <span className="text-sm font-mono text-gray-600 mt-2 block">
              LAT: 40.7128° N | LON: 74.0060° W
            </span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
            <Button onClick={onEnter} size="lg" className="min-w-[200px] text-lg">
              ENTER CONTROL ROOM
            </Button>
            <Button variant="secondary" size="lg" className="min-w-[200px]">
              DOWNLOAD APP
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Stats Ticker */}
      <div className="absolute bottom-0 w-full border-t border-white/10 bg-black/80 backdrop-blur-md overflow-hidden py-3">
        <div className="animate-marquee whitespace-nowrap flex gap-12 text-sm font-mono text-gray-400">
          <span className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-500" /> ZONES SECURED: 142
          </span>
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-500" /> ACTIVE ALERTS: 0
          </span>
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-500" /> CITIZENS CONNECTED: 8,492
          </span>
          <span className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-yellow-500" /> ENCRYPTION: QUANTUM-SAFE
          </span>
           <span className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-500" /> ZONES SECURED: 142
          </span>
          <span className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-500" /> ACTIVE ALERTS: 0
          </span>
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-500" /> CITIZENS CONNECTED: 8,492
          </span>
        </div>
      </div>
    </div>
  );
};
