"use client";

import AdminTerminal from '@/app/admin/AdminTerminal';

/**
 * PRODUCTION ROUTE CONFIGURATION
 * Ensures /admin is never statically cached and always serves the latest node logic.
 * This file is a wrapper around the consolidated Administrative Terminal component.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function AdminPage() {
  return <AdminTerminal />;
}
