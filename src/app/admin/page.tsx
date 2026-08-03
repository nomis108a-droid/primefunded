import AdminTerminal from './AdminTerminal';

/**
 * PRODUCTION ROUTE CONFIGURATION
 * Ensures /admin is never statically cached and always serves the latest node logic.
 * This is a Server Component wrapper for the Client Component terminal.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function AdminPage() {
  return <AdminTerminal />;
}
