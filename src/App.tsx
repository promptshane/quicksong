import { useEffect, useState } from 'react';
import { transport } from './audio/transport';
import { useStore } from './state/store';
import { InstrumentFocus } from './ui/InstrumentFocus';
import { HomeScreen } from './ui/HomeScreen';
import { LayerEditor } from './ui/LayerEditor';
import { PianoLayerEditor } from './ui/PianoLayerEditor';
import { ProjectsScreen } from './ui/ProjectsScreen';
import { ToastHost } from './ui/Toast';

const BUILD_TIME = import.meta.env.VITE_BUILD_TIME as string | undefined;
const BUILD_SHA = (import.meta.env.VITE_COMMIT_SHA as string | undefined)?.slice(0, 7);

function buildLabel(): string {
  if (!BUILD_TIME) return BUILD_SHA ? `Build ${BUILD_SHA}` : 'Development build';
  const date = new Date(BUILD_TIME);
  if (Number.isNaN(date.getTime())) return BUILD_SHA ? `Build ${BUILD_SHA}` : 'Development build';

  const day = date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `Updated ${day} · ${time}${BUILD_SHA ? ` · ${BUILD_SHA}` : ''}`;
}

export function App() {
  const view = useStore((s) => s.view);
  const hydrated = useStore((s) => s.hydrated);
  const [showLaunch, setShowLaunch] = useState(true);

  // Stop playback whenever the screen changes so the transport never runs
  // against a view that is not showing it.
  useEffect(() => {
    transport.stop();
  }, [view]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLaunch(false), 1700);
    return () => window.clearTimeout(timer);
  }, []);

  let screen;
  if (view.name === 'projects') screen = <ProjectsScreen />;
  else if (view.name === 'home') screen = <HomeScreen />;
  else if (view.name === 'guitar' || view.name === 'piano') screen = <InstrumentFocus instrument={view.name} />;
  else if (view.name === 'pianoLayer') screen = <PianoLayerEditor layerId={view.layerId} />;
  else screen = <LayerEditor layerId={view.layerId} />;

  return (
    <>
      {/* Solid strip behind the iOS status bar; see .status-bar-shim. */}
      <div className="status-bar-shim" aria-hidden="true" />
      <div className="app" data-hydrated={hydrated ? 'true' : 'false'}>
        {screen}
        <ToastHost />
      </div>
      {showLaunch && (
        <div className="launch-splash" aria-hidden="true">
          <div className="launch-name">QuickSong</div>
          <div className="launch-build">{buildLabel()}</div>
        </div>
      )}
    </>
  );
}
