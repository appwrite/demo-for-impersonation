import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  createEmailSession,
  deleteCurrentSession,
  getAccount,
  listUsers,
} from './api';
import type { ImpersonationHeader, User } from './api';

const storageKeys = {
  endpoint: 'impersonation-demo-endpoint',
  projectId: 'impersonation-demo-project-id',
} as const;

const defaultEndpoint = import.meta.env.VITE_APPWRITE_ENDPOINT ?? 'http://localhost/v1';
const defaultProjectId = import.meta.env.VITE_APPWRITE_PROJECT ?? '';

const getStoredValue = (key: string, fallback: string) => localStorage.getItem(key) ?? fallback;

function App() {
  const queryClient = useQueryClient();

  const [endpoint, setEndpoint] = useState(() => getStoredValue(storageKeys.endpoint, defaultEndpoint));
  const [projectId, setProjectId] = useState(() => getStoredValue(storageKeys.projectId, defaultProjectId));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [search, setSearch] = useState('');
  const [impersonation, setImpersonation] = useState<ImpersonationHeader>({ type: 'none' });

  useEffect(() => {
    localStorage.setItem(storageKeys.endpoint, endpoint);
  }, [endpoint]);

  useEffect(() => {
    localStorage.setItem(storageKeys.projectId, projectId);
  }, [projectId]);

  const accountQuery = useQuery({
    queryKey: ['account', endpoint, projectId, impersonation],
    queryFn: () => getAccount({ endpoint, projectId, impersonation }),
    enabled: Boolean(endpoint && projectId),
    retry: false,
  });

  const canBrowseUsers = Boolean(accountQuery.data?.impersonator || accountQuery.data?.impersonatorUserId);

  const usersQuery = useQuery({
    queryKey: ['users', endpoint, projectId, impersonation, search],
    queryFn: () => listUsers({ endpoint, projectId, impersonation, search }),
    enabled: Boolean(endpoint && projectId && canBrowseUsers),
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: () => createEmailSession({ endpoint, projectId, email, password }),
    onSuccess: () => {
      setPassword('');
      setImpersonation({ type: 'none' });
      queryClient.invalidateQueries();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => deleteCurrentSession({ endpoint, projectId }),
    onSettled: () => {
      setImpersonation({ type: 'none' });
      queryClient.clear();
    },
  });

  const activeIdentity = accountQuery.data;
  const activeProof = useMemo(() => {
    if (!activeIdentity) {
      return 'Sign in with a user that already has the impersonator attribute enabled.';
    }

    if (activeIdentity.impersonatorUserId) {
      return `You are currently acting as ${activeIdentity.$id}, while the original impersonator is ${activeIdentity.impersonatorUserId}.`;
    }

    if (activeIdentity.impersonator) {
      return `You are signed in as an impersonator (${activeIdentity.$id}) and can browse users before selecting a target.`;
    }

    return `You are signed in as a normal user (${activeIdentity.$id}). Impersonation headers will be ignored.`;
  }, [activeIdentity]);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    loginMutation.mutate();
  };

  const setTarget = (type: ImpersonationHeader['type'], user: User) => {
    if (type === 'id') {
      setImpersonation({ type, value: user.$id });
      return;
    }

    if (type === 'email' && user.email) {
      setImpersonation({ type, value: user.email });
      return;
    }

    if (type === 'phone' && user.phone) {
      setImpersonation({ type, value: user.phone });
    }
  };

  const clearImpersonation = () => {
    setImpersonation({ type: 'none' });
  };

  const accountError = accountQuery.error instanceof ApiError ? accountQuery.error : null;
  const isSignedOut = accountError?.code === 401;
  const sessionLabel = activeIdentity?.impersonatorUserId
    ? 'Impersonating'
    : activeIdentity?.impersonator
      ? 'Impersonator'
      : activeIdentity
        ? 'Signed in'
        : isSignedOut
          ? 'Signed out'
          : 'Checking';
  const currentHeaderValue = impersonation.type === 'none' ? '(none)' : impersonation.value;

  return (
    <main className="app-shell">
      <div className="logo-banner">
        <img src="/appwrite-dark.svg" alt="Appwrite" className="app-logo" />
      </div>

      <header className="app-header">
        <div className="header-copy">
          <p className="header-kicker">Appwrite / CSR demo</p>
          <h1>User impersonation demo</h1>
          <p className="muted header-description">
            Sign in as an impersonator, choose a target user, and confirm that the resolved
            account changes.
          </p>
        </div>
        <p className="header-flow">Sign in {'->'} Pick user {'->'} Verify account</p>
      </header>

      <section className="card proof-card">
        <div className="card-header-row">
          <div>
            <h2>Current state</h2>
            <p className="muted">This is the only thing the demo really needs to prove.</p>
          </div>
          <StatusPill>{sessionLabel}</StatusPill>
        </div>
        <p className="proof-text">{activeProof}</p>
      </section>

      <section className="top-grid">
        <SectionCard title="Connection">
          <div className="form-stack">
            <label className="field">
              <span className="field-label">Endpoint</span>
              <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Project ID</span>
              <input value={projectId} onChange={(event) => setProjectId(event.target.value)} />
            </label>
          </div>
          <p className="muted">
            Values default from <code>VITE_APPWRITE_ENDPOINT</code> and <code>VITE_APPWRITE_PROJECT</code>.
          </p>
        </SectionCard>

        <SectionCard title="Session">
          <form className="form-stack" onSubmit={handleLogin}>
            <label className="field">
              <span className="field-label">Email</span>
              <input
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className="actions">
              <button type="submit" disabled={loginMutation.isPending || !projectId || !endpoint}>
                {loginMutation.isPending ? 'Signing in...' : 'Create email session'}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={!accountQuery.data || logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
              >
                {logoutMutation.isPending ? 'Signing out...' : 'Delete current session'}
              </button>
            </div>
          </form>
          {loginMutation.error ? <p className="notice notice-error">{loginMutation.error.message}</p> : null}
        </SectionCard>
      </section>

      <section className="top-grid">
        <SectionCard title="Active account">
          {accountQuery.isPending ? <p className="muted">Loading account...</p> : null}
          {accountQuery.error && !isSignedOut ? (
            <p className="notice notice-error">{accountQuery.error.message}</p>
          ) : null}
          {activeIdentity ? (
            <dl className="facts-grid">
              <Fact label="Account ID" value={activeIdentity.$id} />
              <Fact label="Name" value={activeIdentity.name || '(empty)'} />
              <Fact label="Email" value={activeIdentity.email || '(empty)'} />
              <Fact label="Impersonator" value={String(Boolean(activeIdentity.impersonator))} />
              <Fact label="Original impersonator" value={activeIdentity.impersonatorUserId ?? '(none)'} />
            </dl>
          ) : (
            <EmptyState>
              {isSignedOut ? 'No authenticated browser session yet.' : 'No authenticated session yet.'}
            </EmptyState>
          )}
        </SectionCard>

        <SectionCard title="Applied headers">
          <dl className="facts-grid">
            <Fact
              label="Browser auth"
              value={accountQuery.data ? 'Session cookie is active' : 'No browser session'}
            />
            <Fact label="Mode" value={impersonation.type} />
            <Fact label="Header value" value={currentHeaderValue} />
          </dl>
          <div className="actions">
            <button
              type="button"
              className="button-secondary"
              disabled={impersonation.type === 'none'}
              onClick={clearImpersonation}
            >
              Clear impersonation
            </button>
          </div>
        </SectionCard>
      </section>

      <section className="card">
        <div className="card-header-row">
          <div>
            <h2>User browser</h2>
            <p className="muted">Pick a user and apply an impersonation header.</p>
          </div>
          <input
            className="search-input"
            placeholder="Search users"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {!accountQuery.data && isSignedOut ? <EmptyState>Create a session to load users.</EmptyState> : null}
        {accountQuery.data && !canBrowseUsers && accountQuery.isSuccess ? (
          <p className="notice notice-warning">
            This account cannot browse users yet. Sign in with an impersonator account first.
          </p>
        ) : null}
        {usersQuery.isPending ? <p className="muted">Loading users...</p> : null}
        {usersQuery.error ? <p className="notice notice-error">{usersQuery.error.message}</p> : null}

        {usersQuery.data ? (
          <div className="resource-list">
            {usersQuery.data.users.map((user) => {
              const isSelected =
                (impersonation.type === 'id' && impersonation.value === user.$id) ||
                (impersonation.type === 'email' && impersonation.value === user.email) ||
                (impersonation.type === 'phone' && impersonation.value === user.phone);

              return (
                <article key={user.$id} className={`resource-card${isSelected ? ' is-selected' : ''}`}>
                  <div className="resource-copy">
                    <div className="resource-title-row">
                      <strong>{user.name || '(anonymous)'}</strong>
                      {isSelected ? <StatusPill>Selected</StatusPill> : null}
                    </div>
                    <p className="muted">
                      <code>{user.$id}</code>
                    </p>
                    <p className="muted">
                      {user.email || '(no email)'} · {user.phone || '(no phone)'}
                    </p>
                  </div>
                  <div className="actions wrap">
                    <button type="button" onClick={() => setTarget('id', user)}>
                      Use ID
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={!user.email}
                      onClick={() => setTarget('email', user)}
                    >
                      Use email
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={!user.phone}
                      onClick={() => setTarget('phone', user)}
                    >
                      Use phone
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}

type FactProps = {
  label: string;
  value: string;
};

function Fact({ label, value }: FactProps) {
  return (
    <div className="fact-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type SectionCardProps = {
  children: ReactNode;
  title: string;
};

function SectionCard({ children, title }: SectionCardProps) {
  return (
    <section className="card">
      <div className="card-header-row">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

type EmptyStateProps = {
  children: ReactNode;
};

function EmptyState({ children }: EmptyStateProps) {
  return <div className="empty-state">{children}</div>;
}

type StatusPillProps = {
  children: ReactNode;
};

function StatusPill({ children }: StatusPillProps) {
  return <span className="status-pill">{children}</span>;
}

export default App;
