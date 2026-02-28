
import { BackgroundPaths } from '../components/ui/background-paths';

interface LandingProps {
  onEnter: () => void;
}

export const Landing = ({ onEnter }: LandingProps) => {
  return <BackgroundPaths title="JagaJaga" onClick={onEnter} />;
};
