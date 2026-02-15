import { useState } from 'react';
import type { Service } from './types';
import { ServiceProvider } from './context/ServiceContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Dashboard from './components/Dashboard';
import AddServiceModal from './components/AddServiceModal';
import EditServiceModal from './components/EditServiceModal';
import SettingsDrawer from './components/SettingsDrawer';

export default function App() {
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <ServiceProvider>
      <div className="min-h-screen flex flex-col">
        <Header
          search={search}
          onSearchChange={setSearch}
          onAddClick={() => setAddOpen(true)}
          onSettingsClick={() => setSettingsOpen(true)}
        />
        <Dashboard search={search} onEdit={setEditService} />
        <Footer />
      </div>

      <AddServiceModal open={addOpen} onClose={() => setAddOpen(false)} />
      <EditServiceModal service={editService} onClose={() => setEditService(null)} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </ServiceProvider>
  );
}
