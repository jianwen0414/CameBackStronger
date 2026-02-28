/**
 * NightWalk Web - Main Application
 * Control Room Dashboard with God View and Analytics
 */
import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Map, BarChart3, Bell, Settings, Shield } from 'lucide-react';
import GodView from './components/GodView';
import AnalyticsPanel from './components/AnalyticsPanel';
import SettingsPanel from './components/SettingsPanel';
import EvidenceModal from './components/EvidenceModal';
import { useAlertStore } from './store/useAlertStore';
import type { ImmediateDanger, SuspiciousLog, CCTVCamera, UserReportedCrime, BeaconType } from './lib/supabase';
import { Landing } from './pages/Landing';

type Tab = 'godview' | 'analytics' | 'settings';
type View = 'landing' | 'dashboard';

function App() {
  const [view, setView] = useState<View>('landing');
  const [activeTab, setActiveTab] = useState<Tab>('godview');
  const { selectAlert, openModal, immediateDangers } = useAlertStore();

  const handleAlertClick = useCallback((
    alert: ImmediateDanger | SuspiciousLog | CCTVCamera | UserReportedCrime,
    type: BeaconType
  ) => {
    selectAlert(alert, type);
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center border border-white/10 shadow-lg">
              <Shield className="w-5 h-5 text-white/90" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                NIGHTWALK
              </h1>
              <p className="text-[10px] text-gray-400 tracking-widest uppercase font-mono">
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
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 shadow-sm backdrop-blur-md">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-gray-300 font-mono font-medium uppercase tracking-wider">
                Live
              </span>
            </div>

            {/* Notification Bell */}
            <button className="relative p-2 rounded-lg hover:bg-white/10 transition-colors border border-transparent hover:border-white/10">
              <Bell className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
              {immediateDangers.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>

            {/* Settings */}
            <button
              onClick={() => setActiveTab('settings')}
              className={`p-2 rounded-lg transition-colors border ${
                activeTab === 'settings'
                  ? 'bg-white/10 border-white/10'
                  : 'hover:bg-white/5 border-transparent hover:border-white/10'
              }`}
            >
              <Settings className={`w-5 h-5 transition-colors ${
                activeTab === 'settings' ? 'text-white' : 'text-gray-400 hover:text-white'
              }`} />
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

        {/* Settings */}
        <motion.div
          initial={false}
          animate={{
            opacity: activeTab === 'settings' ? 1 : 0,
            pointerEvents: activeTab === 'settings' ? 'auto' : 'none'
          }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 overflow-hidden"
        >
          <SettingsPanel />
        </motion.div>
      </main>

      {/* Status Bar */}
      <footer className="h-8 flex-shrink-0 border-t border-white/10 bg-black/60 backdrop-blur-md px-4 z-50">
        <div className="h-full flex items-center justify-between text-[10px] font-mono text-gray-500 uppercase tracking-widest">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5">System Status: <span className="text-gray-300">Operational</span></span>
            <span className="text-white/10">|</span>
            <span>Connected Cameras: <span className="text-gray-300">24</span></span>
            <span className="text-white/10">|</span>
            <span>Response Time: <span className="text-gray-300">45ms</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span>NightWalk Dashboard</span>
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
          ? 'bg-neutral-800 text-white shadow-md border border-white/10'
          : 'text-gray-400 hover:text-white hover:bg-neutral-800/50 border border-transparent'
        }
      `}
    >
      {icon}
      <span>{label}</span>
      {hasAlert && !isActive && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-ping" />
      )}
    </button>
  );
}

export default App;
