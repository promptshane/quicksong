import { useEffect } from 'react';
import { transport } from './audio/transport';
import { useStore } from './state/store';
import { GuitarFocus } from './ui/GuitarFocus';
import { HomeScreen } from './ui/HomeScreen';
import { LayerEditor } from './ui/LayerEditor';
import { ToastHost } from './ui/Toast';

export function App() {
  const view = useStore((s) => s.view);
  const hydrated = useStore((s) => s.hydrated);

  // Stop playback whenever the screen changes so the transport never runs
  // against a view that is not showing it.
  useEffect(() => {
    transport.stop();
  }, [view]);

  let screen;
  if (view.name === 'home') screen = <HomeScreen />;
  else if (view.name === 'guitar') screen = <GuitarFocus />;
  else screen = <LayerEditor layerId={view.layerId} />;

  return (
    <div className="app" data-hydrated={hydrated ? 'true' : 'false'}>
      {screen}
      <ToastHost />
    </div>
  );
}
