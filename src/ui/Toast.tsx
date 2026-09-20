import { useToast } from './toastStore';

export function ToastHost() {
  const message = useToast((s) => s.message);
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
