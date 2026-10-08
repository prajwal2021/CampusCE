import Sidebar from '@/components/Sidebar';

export const metadata = {
  title: 'Flumen Admin',
  description: 'CampusCE pipeline administration',
};

export default function AdminLayout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
