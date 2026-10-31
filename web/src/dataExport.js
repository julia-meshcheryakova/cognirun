/**
 * "Export my data": everything CogniRun holds about the runner, as one JSON
 * file: the account (when signed in) and every run this device can see,
 * which with an account includes the runs synced from other devices.
 */
export function buildDataExport({ runs, authState = null, version = '', now = new Date() }) {
  const user = authState?.status === 'signed-in' ? authState.user : null;
  const profile = authState?.profile ?? null;
  return {
    app: 'CogniRun',
    version,
    exportedAt: now.toISOString(),
    account: user
      ? {
          id: user.id,
          email: user.email ?? null,
          displayName: profile?.display_name ?? null,
          createdAt: profile?.created_at ?? null,
          termsVersion: profile?.terms_version ?? null,
          termsAcceptedAt: profile?.terms_accepted_at ?? null,
        }
      : null,
    runs,
  };
}

export function exportFileName(now = new Date()) {
  return `cognirun-data-${now.toISOString().slice(0, 10)}.json`;
}
