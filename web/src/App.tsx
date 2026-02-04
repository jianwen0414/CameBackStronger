/**
 * NightWalk Web - Main Application
 * Control Room Dashboard with God View and Analytics
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map, BarChart3, Bell, Settings, Shield, LogOut } from 'lucide-react';
import GodView from './components/GodView';
import AnalyticsPanel from './components/AnalyticsPanel';
import EvidenceModal from './components/EvidenceModal';
import { useAlertStore } from './store/useAlertStore';
import type { ImmediateDanger, SuspiciousLog } from './lib/supabase';
import { Landing } from './pages/Landing';

type Tab = 'godview' | 'analytics';
type View = 'landing' | 'dashboard';

function App() {
  const [view, setView] = useState<View>('landing');
  const [activeTab, setActiveTab] = useState<Tab>('godview');
  const { selectAlert, openModal, immediateDangers } = useAlertStore();

  const handleAlertClick = useCallback((alert: ImmediateDanger | SuspiciousLog) => {
    selectAlert(alert);
    openModal();
  }, [selectAlert, openModal]);

  if (view === 'landing') {
    return <Landing onEnter={() => setView('dashboard')} />;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--color-void)] grid-background text-white font-sans">
      {/* Top Navigation Bar */}
      <header className="h-16 flex-shrink-0 border-b border-white/10 bg-black/40 backdrop-blur-md z-50">
        <div className="h-full flex items-center justify-between px-6">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('landing')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.3)]">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wider text-glow-cyan">
                NIGHTWALK
              </h1>
              <p className="text-[10px] text-gray-400 tracking-[0.2em] uppercase font-mono">
                Control Room
              </p>
            </div>
          </div>

          {/* Center Tabs */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/5">
            <TabButton
              icon={<Map className="w-4 h-4" />}
              label="God View"
              isActive={activeTab === 'godview'}
              onClick={() => setActiveTab('godview')}
              hasAlert={immediateDangers.length > 0}
            />
            <TabButton
              icon={<BarChart3 className="w-4 h-4" />}
              label="Analytics"
              isActive={activeTab === 'analytics'}
              onClick={() => setActiveTab('analytics')}
            />
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {/* Live Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/30">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_#22c55e]" />
              <span className="text-xs text-green-500 font-mono font-medium uppercase tracking-wider">
                Live
              </span>
            </div>

            {/* Notification Bell */}
            <button className="relative p-2 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
              <Bell className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
              {immediateDangers.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse" />
              )}
            </button>

            {/* Settings */}
            <button className="p-2 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
              <Settings className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 relative">
        {/* God View */}
        <motion.div
          initial={false}
          animate={{
            opacity: activeTab === 'godview' ? 1 : 0,
            pointerEvents: activeTab === 'godview' ? 'auto' : 'none'
          }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0"
        >
          <GodView onAlertClick={handleAlertClick} />
        </motion.div>

        {/* Analytics */}
        <motion.div
          initial={false}
          animate={{
            opacity: activeTab === 'analytics' ? 1 : 0,
            pointerEvents: activeTab === 'analytics' ? 'auto' : 'none'
          }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 overflow-hidden"
        >
          <AnalyticsPanel />
        </motion.div>
      </main>

      {/* Status Bar */}
      <footer className="h-8 flex-shrink-0 border-t border-white/10 bg-black/60 backdrop-blur-md px-4 z-50">
        <div className="h-full flex items-center justify-between text-[10px] font-mono text-gray-500 uppercase tracking-widest">
          <div className="flex items-center gap-6">
            <span>System Status: <span className="text-green-500 text-shadow-glow">Operational</span></span>
            <span className="text-white/10">|</span>
            <span>Connected Cameras: <span className="text-cyan-500">24</span></span>
            <span className="text-white/10">|</span>
            <span>Response Time: <span className="text-cyan-500">45ms</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span>NightWalk v2.0.77</span>
            <span className="text-cyan-500">•</span>
            <span>CityGaze Ecosystem</span>
          </div>
        </div>
      </footer>

      {/* Evidence Modal */}
      <EvidenceModal />
    </div>
  );
}

// Tab Button Component
interface TabButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  hasAlert?: boolean;
}

function TabButton({ icon, label, isActive, onClick, hasAlert }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-300
        ${isActive
          ? 'bg-white/10 text-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.1)] border border-cyan-500/30'
          : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'
        }
      `}
    >
      {icon}
      <span>{label}</span>
      {hasAlert && !isActive && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444] animate-ping" />
      )}
    </button>
  );
}

export default App;
