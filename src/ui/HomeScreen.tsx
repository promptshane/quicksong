import { selectActiveProject, useStore } from '../state/store';
import { Overview } from './Overview';
import { PlayButton } from './PlayButton';
import { toast } from './toastStore';
import { TopBar } from './TopBar';

const INSTRUMENTS = [
  { id: 'drums', label: 'Drums', icon: '🥁', enabled: false },
  { id: 'guitar', label: 'Guitar', icon: '🎸', enabled: true },
  { id: 'piano', label: 'Piano', icon: '🎹', enabled: false },
  { id: 'bass', label: 'Bass', icon: '🎚', enabled: false },
  { id: 'vocals', label: 'Vocals', icon: '🎤', enabled: false },
] as const;

export function HomeScreen() {
  const song = useStore((s) => s.song);
  const setView = useStore((s) => s.setView);
  const project = useStore(selectActiveProject);
  const closeProject = useStore((s) => s.closeProject);

  return (
    <div className="screen" data-screen="home">
      <div className="header">
        <div className="header-side">
          <button className="btn ghost" onClick={() => void closeProject()} aria-label="Back to projects">
            ‹ Projects
          </button>
        </div>
        <div className="header-title" data-testid="project-title">
          {project?.name ?? 'Song'}
        </div>
        <div className="header-side right" />
      </div>
      <TopBar />
      <div className="screen-body">
        <div className="rows">
          {INSTRUMENTS.map((inst) => {
            const layers = inst.id === 'guitar' ? song.guitar.layers : [];
            return (
              <button
                key={inst.id}
                className={`row ${inst.enabled ? '' : 'locked'}`}
                aria-disabled={!inst.enabled}
                aria-label={inst.label}
                data-instrument={inst.id}
                onClick={() => {
                  if (inst.enabled) setView({ name: 'guitar' });
                  else toast(`${inst.label} is coming later`);
                }}
              >
                <div className="row-icon" aria-hidden>
                  {inst.icon}
                  {!inst.enabled && <span className="lock">🔒</span>}
                </div>
                <div className="row-lane">
                  {layers.length === 0 ? (
                    <div className="row-empty">{inst.enabled ? 'Tap to add guitar' : inst.label}</div>
                  ) : (
                    layers.map((layer) => <Overview key={layer.id} song={song} layer={layer} />)
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="bottombar">
        <PlayButton />
      </div>
    </div>
  );
}
