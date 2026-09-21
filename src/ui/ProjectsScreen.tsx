import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { transport, useTransport } from '../audio/transport';
import { lastEventEnd, songBeats } from '../model/time';
import { loadProject } from '../state/persistence';
import { useStore } from '../state/store';
import { Sheet } from './Sheet';
import { toast } from './toastStore';

type Action = { kind: 'menu'; id: string } | { kind: 'rename'; id: string } | { kind: 'delete'; id: string } | null;

/**
 * Launch screen: every saved project by name. Tap opens; hold shows
 * Rename / Duplicate / Delete (same hold gesture as layers and events).
 */
export function ProjectsScreen() {
  const projects = useStore((s) => s.projects);
  const openProject = useStore((s) => s.openProject);
  const createProject = useStore((s) => s.createProject);
  const renameProject = useStore((s) => s.renameProject);
  const duplicateProject = useStore((s) => s.duplicateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const transportPlaying = useTransport((s) => s.playing);
  const playheadBeat = useTransport((s) => s.playheadBeat);

  const [action, setAction] = useState<Action>(null);
  const [preview, setPreview] = useState<{ id: string; endBeat: number } | null>(null);
  const previewRequest = useRef(0);
  const [draftName, setDraftName] = useState('');
  const hold = useRef<{ id: string; startX: number; startY: number; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const suppressOpen = useRef<string | null>(null);

  const target = action ? projects.find((p) => p.id === action.id) ?? null : null;

  const clearHold = () => {
    if (hold.current?.timer) clearTimeout(hold.current.timer);
    hold.current = null;
  };

  const startHold = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    clearHold();
    const h = { id, startX: e.clientX, startY: e.clientY, timer: null as ReturnType<typeof setTimeout> | null };
    h.timer = setTimeout(() => {
      if (hold.current !== h) return;
      // The click that ends this press must not open the project.
      suppressOpen.current = id;
      setAction({ kind: 'menu', id });
    }, 550);
    hold.current = h;
  };

  const moveHold = (e: ReactPointerEvent<HTMLElement>) => {
    const h = hold.current;
    if (h && Math.hypot(e.clientX - h.startX, e.clientY - h.startY) > 8) clearHold();
  };

  const open = (id: string) => {
    if (suppressOpen.current === id) {
      suppressOpen.current = null;
      return;
    }
    void openProject(id).then((ok) => {
      if (!ok) toast('That project no longer exists');
    });
  };

  const close = () => {
    suppressOpen.current = null;
    setAction(null);
  };

  const startRename = (id: string) => {
    setDraftName(projects.find((p) => p.id === id)?.name ?? '');
    setAction({ kind: 'rename', id });
  };

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    if (!action) return;
    const id = action.id;
    void renameProject(id, draftName).then((ok) => {
      if (!ok) {
        toast('Give the project a name');
        return;
      }
      close();
    });
  };

  const duplicate = (id: string) => {
    void duplicateProject(id).then((copy) => {
      if (copy) toast('Duplicated');
    });
    close();
  };

  const stopPreview = () => {
    previewRequest.current++;
    transport.stop(0);
    setPreview(null);
  };

  const togglePreview = async (id: string) => {
    if (preview?.id === id && transport.isPlaying) {
      stopPreview();
      return;
    }

    const request = ++previewRequest.current;
    transport.stop(0);
    setPreview(null);

    const record = await loadProject(id);
    if (request !== previewRequest.current) return;
    if (!record) {
      toast('That project no longer exists');
      return;
    }
    if (lastEventEnd(record.song) <= 0) {
      toast('Nothing to play yet');
      return;
    }

    const endBeat = songBeats(record.song);
    setPreview({ id, endBeat });
    await transport.play(record.song, 0, { endBeat, loop: true });
    if (request !== previewRequest.current) {
      transport.stop(0);
      return;
    }
    if (!transport.isPlaying) setPreview(null);
  };

  const remove = (id: string) => {
    if (preview?.id === id) stopPreview();
    void deleteProject(id);
    close();
  };

  useEffect(
    () => () => {
      previewRequest.current++;
      transport.stop(0);
    },
    [],
  );

  const previewRemaining =
    preview && transportPlaying && preview.endBeat > 0
      ? Math.max(0, Math.min(1, 1 - playheadBeat / preview.endBeat))
      : 1;

  return (
    <div className="screen" data-screen="projects">
      <div className="header">
        <div className="header-side" />
        <div className="header-title">QuickSong</div>
        <div className="header-side right" />
      </div>

      <div className="screen-body">
        <div className="projects">
          <div className="panel-label projects-label">Projects</div>
          {projects.length === 0 ? (
            <div className="empty-state">
              No projects yet.
              <br />
              Start one below.
            </div>
          ) : (
            <div className="project-list">
              {projects.map((p) => {
                const isPreviewing = preview?.id === p.id && transportPlaying;
                const remaining = isPreviewing ? previewRemaining : 1;
                return (
                  <div
                    key={p.id}
                    className="project-card"
                    data-project-card={p.id}
                    onPointerDown={(e) => startHold(e, p.id)}
                    onPointerMove={moveHold}
                    onPointerUp={clearHold}
                    onPointerCancel={clearHold}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <button className="project-open" onClick={() => open(p.id)} aria-label={`Open ${p.name}`}>
                      <span>{p.name}</span>
                    </button>
                    <button
                      className={`project-preview ${isPreviewing ? 'playing' : ''}`}
                      aria-label={isPreviewing ? `Stop ${p.name}` : `Play ${p.name}`}
                      data-testid="project-preview"
                      data-project-preview={p.id}
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        void togglePreview(p.id);
                      }}
                    >
                      <svg className="project-preview-ring" viewBox="0 0 48 48" aria-hidden="true">
                        <circle className="project-preview-track" cx="24" cy="24" r="20" />
                        <circle
                          className="project-preview-progress"
                          cx="24"
                          cy="24"
                          r="20"
                          pathLength="100"
                          strokeDasharray={`${remaining * 100} 100`}
                        />
                      </svg>
                      {isPreviewing ? (
                        <span className="project-preview-stop" aria-hidden="true" />
                      ) : (
                        <svg className="project-preview-play" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M8 6.2v11.6a1 1 0 0 0 1.54.84l8.7-5.8a1 1 0 0 0 0-1.68l-8.7-5.8A1 1 0 0 0 8 6.2Z" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bottombar">
        <button className="btn primary wide" onClick={() => void createProject()} data-testid="new-project">
          + New Project
        </button>
      </div>

      {action?.kind === 'menu' && target && (
        <Sheet title={target.name} onClose={close}>
          <div className="option-list">
            <button className="option" onClick={() => startRename(target.id)} data-testid="project-rename">
              <span>Rename</span>
            </button>
            <button className="option" onClick={() => duplicate(target.id)} data-testid="project-duplicate">
              <span>Duplicate</span>
            </button>
            <button className="option danger" onClick={() => setAction({ kind: 'delete', id: target.id })} data-testid="project-delete">
              <span>Delete</span>
            </button>
          </div>
        </Sheet>
      )}

      {action?.kind === 'rename' && target && (
        <Sheet title="Rename project" onClose={close}>
          <form className="sheet-form" onSubmit={submitRename}>
            <input
              className="text-input"
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              aria-label="Project name"
              autoFocus
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              data-testid="project-name-input"
            />
            <button className="btn primary wide" type="submit" disabled={draftName.trim().length === 0} data-testid="project-rename-save">
              Save
            </button>
          </form>
        </Sheet>
      )}

      {action?.kind === 'delete' && target && (
        <Sheet title={`Delete "${target.name}"?`} onClose={close}>
          <div className="panel-hint">This removes the project and its song. There is no undo.</div>
          <button className="btn danger wide" onClick={() => remove(target.id)} data-testid="confirm-delete-project">
            Delete project
          </button>
        </Sheet>
      )}
    </div>
  );
}
