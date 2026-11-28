import { useCallback, useEffect, useRef, useState } from 'react';
import type { Service } from './types';
import { ServiceProvider, useServices } from './context/ServiceContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { IconSourceProvider } from './context/IconSourceContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Dashboard, { useDashboardView } from './components/Dashboard';
import AddServiceModal from './components/AddServiceModal';
import EditServiceModal from './components/EditServiceModal';
import SettingsDrawer from './components/SettingsDrawer';
import UnlockModal from './components/UnlockModal';
import ShortcutsDialog from './components/ShortcutsDialog';
import { readQueryParam, writeQueryParam } from './lib/search';
import { cardElements, cardOf, isTypingTarget, openLink, targetCard } from './lib/keyboard';
import { safeHref } from './lib/url';

export default function App() {
  return (
    <AuthProvider>
      <IconSourceProvider>
        <ServiceProvider>
          <Shell />
        </ServiceProvider>
      </IconSourceProvider>
    </AuthProvider>
  );
}

const NAV_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']);

function Shell() {
  const { canEdit } = useAuth();
  const { services } = useServices();
  const [search, setSearch] = useState(readQueryParam);
  const [addOpen, setAddOpen] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const view = useDashboardView(search);

  const changeSearch = useCallback((q: string) => {
    setSearch(q);
    writeQueryParam(q);
  }, []);

  const dialogOpen =
    (canEdit && (addOpen || editService !== null || settingsOpen)) || unlockOpen || shortcutsOpen;

  // Single-key shortcuts; never while typing in a field or while a dialog is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (dialogOpen || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const focusedCard = cardOf(document.activeElement);

      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (focusedCard && NAV_KEYS.has(e.key)) {
        e.preventDefault();
        targetCard(cardElements(), focusedCard, e.key)?.focus();
      } else if (focusedCard && e.key === 'Enter') {
        const href = safeHref(focusedCard.getAttribute('href') ?? '');
        if (href) {
          e.preventDefault();
          openLink(href);
        }
      } else if (focusedCard && e.key === 'e' && !e.shiftKey && canEdit) {
        const service = services.find((s) => s.id === focusedCard.dataset.id);
        if (service) {
          e.preventDefault();
          setEditService(service);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen, canEdit, services]);

  const openFirstResult = () => {
    const first = view.results[0];
    const href = first ? safeHref(first.url) : undefined;
    if (href) openLink(href);
  };

  return (
    <>
      <div className="min-h-screen flex flex-col overflow-x-clip">
        <Header
          search={search}
          searchRef={searchRef}
          onSearchChange={changeSearch}
          onSearchSubmit={openFirstResult}
          onSearchDown={() => cardElements()[0]?.focus()}
          onAddClick={() => setAddOpen(true)}
          onSettingsClick={() => setSettingsOpen(true)}
          onUnlockClick={() => setUnlockOpen(true)}
        />
        <Dashboard view={view} onEdit={setEditService} />
        <Footer onShortcutsClick={() => setShortcutsOpen(true)} />
      </div>

      {/* Edit UI is only mounted while editing is allowed. */}
      <AddServiceModal open={canEdit && addOpen} onClose={() => setAddOpen(false)} />
      <EditServiceModal
        service={canEdit ? editService : null}
        onClose={() => setEditService(null)}
      />
      {canEdit && <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
      <UnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} />
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    </>
  );
}
