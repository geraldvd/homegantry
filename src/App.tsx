import { useState } from 'react';
import type { Service } from './types';
import { ServiceProvider } from './context/ServiceContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Dashboard from './components/Dashboard';
import AddServiceModal from './components/AddServiceModal';
import EditServiceModal from './components/EditServiceModal';
import SettingsDrawer from './components/SettingsDrawer';
import UnlockModal from './components/UnlockModal';

export default function App() {
  return (
    <AuthProvider>
      <ServiceProvider>
        <Shell />
      </ServiceProvider>
    </AuthProvider>
  );
}

function Shell() {
  const { canEdit } = useAuth();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);

  return (
    <>
      <div className="min-h-screen flex flex-col">
        <Header
          search={search}
          onSearchChange={setSearch}
          onAddClick={() => setAddOpen(true)}
          onSettingsClick={() => setSettingsOpen(true)}
          onUnlockClick={() => setUnlockOpen(true)}
        />
        <Dashboard search={search} onEdit={setEditService} />
        <Footer />
      </div>

      {/* Edit UI is only mounted while editing is allowed. */}
      <AddServiceModal open={canEdit && addOpen} onClose={() => setAddOpen(false)} />
      <EditServiceModal
        service={canEdit ? editService : null}
        onClose={() => setEditService(null)}
      />
      {canEdit && <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
      <UnlockModal open={unlockOpen} onClose={() => setUnlockOpen(false)} />
    </>
  );
}
