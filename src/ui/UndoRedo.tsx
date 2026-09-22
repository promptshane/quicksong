import { describeChange } from '../model/labels';
import { selectCanRedo, selectCanUndo, useStore } from '../state/store';
import { toast } from './toastStore';

/** Say what Undo/Redo just changed — history is project-wide, so it may be off-screen. */
function undoWithToast(): void {
  const { past, song, undo } = useStore.getState();
  if (past.length === 0) return;
  const change = describeChange(past[past.length - 1], song);
  undo();
  toast(`Undo: ${change}`);
}

function redoWithToast(): void {
  const { future, song, redo } = useStore.getState();
  if (future.length === 0) return;
  const change = describeChange(song, future[0]);
  redo();
  toast(`Redo: ${change}`);
}

/** The project's Undo / Redo pair, shown on every screen inside a project. */
export function UndoRedo() {
  const canUndo = useStore(selectCanUndo);
  const canRedo = useStore(selectCanRedo);
  return (
    <>
      <button className="btn icon ghost" onClick={undoWithToast} disabled={!canUndo} aria-label="Undo" data-testid="undo">
        ↶
      </button>
      <button className="btn icon ghost" onClick={redoWithToast} disabled={!canRedo} aria-label="Redo" data-testid="redo">
        ↷
      </button>
    </>
  );
}
