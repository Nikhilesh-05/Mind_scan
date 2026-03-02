import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
            <Sidebar />
            <main style={{ flex: 1, marginLeft: '260px', minHeight: '100vh', overflowX: 'hidden' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px' }}>
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
