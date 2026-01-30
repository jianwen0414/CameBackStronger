/**
 * NightWalk Web - Main Application
 * Control Room Dashboard with God View and Analytics
 */
import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Map, BarChart3, Bell, Settings, Shield } from 'lucide-react';
import GodView from './components/GodView';
import AnalyticsPanel from './components/AnalyticsPanel';
import EvidenceModal from './components/EvidenceModal';
import { useAlertStore } from './store/useAlertStore';
import type { ImmediateDanger, SuspiciousLog } from './lib/supabase';

type Tab = 'godview' | 'analytics';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('godview');
  const { selectAlert, openModal, immediateDangers } = useAlertStore();

  const handleAlertClick = useCallback((alert: ImmediateDanger | SuspiciousLog) => {
    selectAlert(alert);
    openModal();
  }, [selectAlert, openModal]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-primary)] grid-background">
      {/* Top Navigation Bar */}
      <header className="h-16 flex-shrink-0 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
        <div className="h-full flex items-center justify-between px-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--neon-cyan)] to-[var(--neon-purple)] flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wider text-glow-cyan">
                NIGHTWALK
              </h1>
              <p className="text-xs text-[var(--text-muted)] tracking-widest uppercase">
                Control Room
              </p>
            </div>
          </div>

          {/* Center Tabs */}
          <div className="flex items-center gap-1 bg-[var(--bg-tertiary)] rounded-xl p-1">
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
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(0,255,136,0.1)] border border-[var(--neon-green)]">
              <div className="status-dot status-active" />
              <span className="text-xs text-[var(--neon-green)] font-medium uppercase tracking-wider">
                Live
              </span>
            </div>

            {/* Notification Bell */}
            <button className="relative p-2 rounded-lg hover:bg-white/5 transition-colors">
              <Bell className="w-5 h-5 text-[var(--text-secondary)]" />
              {immediateDangers.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--neon-red)]" />
              )}
            </button>

            {/* Settings */}
            <button className="p-2 rounded-lg hover:bg-white/5 transition-colors">
              <Settings className="w-5 h-5 text-[var(--text-secondary)]" />
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
          className="absolute inset-0 overflow-hidden"
        >
          <AnalyticsPanel />
        </motion.div>
      </main>

      {/* Status Bar */}
      <footer className="h-8 flex-shrink-0 border-t border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4">
        <div className="h-full flex items-center justify-between text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-4">
            <span>System Status: <span className="text-[var(--neon-green)]">Operational</span></span>
            <span>|</span>
            <span>Connected Cameras: <span className="text-[var(--text-primary)]">24</span></span>
            <span>|</span>
            <span>Response Time: <span className="text-[var(--text-primary)]">45ms</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span>NightWalk v1.0.0</span>
            <span className="text-[var(--neon-cyan)]">•</span>
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
        relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all
        ${isActive
          ? 'bg-[var(--bg-primary)] text-[var(--neon-cyan)] shadow-lg'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }
      `}
    >
      {icon}
      <span>{label}</span>
      {hasAlert && !isActive && (
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[var(--neon-red)] beacon-pulse" />
      )}
    </button>
  );
}

export default App;
