import { useServices } from '../context/ServiceContext';

export default function Footer() {
  const { services, connected } = useServices();
  const dockerCount = services.filter((s) => s.source === 'docker').length;

  return (
    <footer className="border-t border-surface-600/40 bg-surface-900/80 backdrop-blur-sm">
      <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <span>{dockerCount} container{dockerCount !== 1 ? 's' : ''}</span>
        </div>
        <span>Powered by HomeGantry</span>
      </div>
    </footer>
  );
}
