import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import {
  ApiError,
  dispatchSync,
  getSettings,
  putCredential,
  type CredentialState,
  type Settings,
  type SyncStep,
} from '@/lib/api';
import { buttonTone } from '@/components/edit/controls';
import { integrations, syncSchedule } from '@/config/integrations';

/**
 * The settings panel: what needs attention, the credentials the syncs run on, the
 * syncs themselves, and the configuration of the build and of the API.
 *
 * Read-mostly by design. The two things it can *do* are replace a credential and start
 * a sync; everything else is a readout, because configuration that can be edited from
 * a web page is configuration one stolen token away from being somebody else's.
 */

/** Same window the API flags in, so the page and the rail never disagree. */
const WARN_DAYS = 14;

type Tone = 'ok' | 'warn' | 'bad' | 'muted';

const toneClass: Record<Tone, string> = {
  ok: 'text-signal',
  warn: 'text-[var(--color-fault-strain)]',
  bad: 'text-danger',
  muted: 'text-muted',
};

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const formatDate = (iso?: string) => (iso ? dateFormat.format(new Date(iso)).toUpperCase() : '—');
const formatDateTime = (iso?: string) =>
  iso ? dateTimeFormat.format(new Date(iso)).toUpperCase() : '—';

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function expiryTone(iso?: string): Tone {
  if (!iso) return 'muted';
  const days = daysUntil(iso);
  return days <= 7 ? 'bad' : days <= WARN_DAYS ? 'warn' : 'ok';
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.isAuth ? 'Not signed in — sign in again.' : error.message;
  }
  return 'Something failed that should not have. Check the console.';
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await getSettings());
      setError(null);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="type-micro text-signal">00 / SETTINGS</p>
        <h1 className="type-display">SETTINGS</h1>
        <p className="type-meta-lg max-w-prose">
          Credentials the syncs run on, how the syncs are doing, and what the site and the
          API are configured with. Secrets are never shown — only whether they are set, and
          when.
        </p>
      </header>

      {error && (
        <p role="alert" className="type-fine rounded-standard border border-danger/45 p-2 text-danger">
          {error}
        </p>
      )}

      {!settings && !error && <p className="type-meta">LOADING SETTINGS…</p>}

      {settings && (
        <>
          <Attention settings={settings} />
          <CredentialsSection settings={settings} onChanged={load} />
          <SyncSection settings={settings} onDispatched={load} />
          <ConfigurationSection settings={settings} />
        </>
      )}
    </div>
  );
}

/* --- 01 attention --------------------------------------------------------- */

function Attention({ settings }: { settings: Settings }) {
  const items: { tone: Tone; text: string }[] = [];

  for (const credential of settings.credentials) {
    if (!credential.present && settings.github.secrets) {
      items.push({ tone: 'bad', text: `${credential.label} is not set.` });
    } else if (credential.expiresAt) {
      const days = daysUntil(credential.expiresAt);
      if (days <= 0) items.push({ tone: 'bad', text: `${credential.label} has expired.` });
      else if (days <= WARN_DAYS)
        items.push({ tone: expiryTone(credential.expiresAt), text: `${credential.label} expires in ${days} days.` });
    }
  }

  const tokenExpiry = settings.github.tokenExpiresAt;
  if (tokenExpiry && daysUntil(tokenExpiry) <= WARN_DAYS) {
    items.push({
      tone: expiryTone(tokenExpiry),
      text: `The API's GitHub token expires on ${formatDate(tokenExpiry)} — issue a new one and update GitHub--Token in Key Vault.`,
    });
  }

  if (!settings.github.configured) {
    items.push({
      tone: 'warn',
      text: 'GitHub is not configured on the API, so credentials cannot be replaced from here. Add GitHub--Token to Key Vault.',
    });
  } else if (settings.github.error) {
    items.push({ tone: 'bad', text: settings.github.error });
  }

  for (const step of settings.github.latestSteps ?? []) {
    if (step.conclusion === 'failure' && step.name.startsWith('Sync ')) {
      items.push({ tone: 'bad', text: `Last sync failed: ${step.name}.` });
    }
  }

  if (!settings.api.postgres) {
    items.push({ tone: 'bad', text: 'The API cannot reach Postgres.' });
  }

  return (
    <Section index="01" title="ATTENTION">
      {items.length === 0 ? (
        <p className="type-fine text-signal">Nothing needs attention.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map((item) => (
            <li key={item.text} className={`type-fine flex gap-1 ${toneClass[item.tone]}`}>
              <span aria-hidden="true">●</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* --- 02 credentials ------------------------------------------------------- */

function CredentialsSection({ settings, onChanged }: { settings: Settings; onChanged: () => void }) {
  const writable = settings.github.configured && !settings.github.error;
  return (
    <Section index="02" title="CREDENTIALS" note="STORED AS GITHUB ACTIONS SECRETS">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {settings.credentials.map((credential) => (
          <CredentialCard
            key={credential.secret}
            credential={credential}
            writable={writable}
            onChanged={onChanged}
          />
        ))}
      </div>
    </Section>
  );
}

function CredentialCard({
  credential,
  writable,
  onChanged,
}: {
  credential: CredentialState;
  writable: boolean;
  onChanged: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'saved'; message: string }
    | { status: 'error'; message: string; canSkip: boolean }
  >({ status: 'idle' });

  const save = async (skipCheck: boolean) => {
    setState({ status: 'saving' });
    try {
      const result = await putCredential(credential.secret, value, skipCheck);
      setValue('');
      setState({
        status: 'saved',
        message: result.expiresAt
          ? `SAVED — CHECKED WITH SONY, GOOD UNTIL ABOUT ${formatDate(result.expiresAt)}`
          : result.checkedWithSource
            ? 'SAVED — CHECKED'
            : 'SAVED — NOT CHECKED',
      });
      onChanged();
    } catch (cause) {
      setState({
        status: 'error',
        message: describeError(cause),
        canSkip: cause instanceof ApiError && cause.status === 424,
      });
    }
  };

  let status: { tone: Tone; text: string };
  if (!credential.present) {
    status = { tone: 'bad', text: 'NOT SET' };
  } else if (!credential.expires) {
    status = { tone: 'ok', text: `SET ${formatDate(credential.setAt)} · DOES NOT EXPIRE` };
  } else if (credential.expiresAt) {
    const days = daysUntil(credential.expiresAt);
    status = {
      tone: expiryTone(credential.expiresAt),
      text:
        days <= 0
          ? `SET ${formatDate(credential.setAt)} · EXPIRED ${formatDate(credential.expiresAt)}`
          : `SET ${formatDate(credential.setAt)} · EXPIRES ABOUT ${formatDate(credential.expiresAt)} · ${days} DAYS`,
    };
  } else {
    // Present, has an expiry, but no date that belongs to it: set in GitHub's own UI, or
    // saved here without Sony being reachable.
    status = { tone: 'warn', text: `SET ${formatDate(credential.setAt)} · EXPIRY UNKNOWN` };
  }

  return (
    <article className="flex flex-col gap-2 rounded-standard border border-line bg-panel p-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="type-title">{credential.label}</h3>
        <p className="type-meta">{credential.secret}</p>
      </div>

      <p className={`type-micro ${toneClass[status.tone]}`}>{status.text}</p>
      {credential.present && credential.expires && !credential.expiryCurrent && (
        <p className="type-fine text-muted">
          It was replaced outside this page, or saved without being checked, so there is no
          date for it. Replacing it here records one.
        </p>
      )}

      <p className="type-fine text-muted">{credential.howToGet}</p>

      {writable && (
        <form
          className="mt-auto flex flex-col gap-1 border-t border-line pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <label htmlFor={id} className="type-micro">
            NEW VALUE
          </label>
          <div className="flex flex-wrap items-center gap-1">
            <input
              id={id}
              type="password"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              // Not a site login: no browser should offer to remember it or fill it in.
              autoComplete="off"
              spellCheck={false}
              className="type-fine min-w-0 flex-1 rounded-compact border border-line bg-well px-1 py-1 text-ink focus:border-signal focus:outline-none"
            />
            <button
              type="submit"
              disabled={!value.trim() || state.status === 'saving'}
              className={buttonTone.signal}
            >
              {state.status === 'saving' ? 'SAVING…' : credential.verifiable ? 'CHECK AND SAVE' : 'SAVE'}
            </button>
          </div>

          {state.status === 'saved' && (
            <p aria-live="polite" className="type-micro text-signal">
              {state.message}
            </p>
          )}
          {state.status === 'error' && (
            <div aria-live="polite" className="flex flex-wrap items-center gap-1">
              <p className="type-micro text-danger">{state.message.toUpperCase()}</p>
              {state.canSkip && (
                <button type="button" onClick={() => void save(true)} className={buttonTone.plain}>
                  SAVE WITHOUT CHECKING
                </button>
              )}
            </div>
          )}
        </form>
      )}
    </article>
  );
}

/* --- 03 content sync ------------------------------------------------------ */

function stepFor(steps: SyncStep[] | undefined, name: string) {
  return steps?.find((step) => step.name === name);
}

function stepStatus(step: SyncStep | undefined): { tone: Tone; text: string } {
  if (!step) return { tone: 'muted', text: '—' };
  if (step.status !== 'completed') return { tone: 'warn', text: 'RUNNING' };
  switch (step.conclusion) {
    case 'success':
      return { tone: 'ok', text: 'OK' };
    case 'failure':
      return { tone: 'bad', text: 'FAILED' };
    case 'skipped':
      return { tone: 'muted', text: 'SKIPPED' };
    default:
      return { tone: 'muted', text: (step.conclusion ?? '—').toUpperCase() };
  }
}

function runTone(conclusion?: string, status?: string): Tone {
  if (status !== 'completed') return 'warn';
  return conclusion === 'success' ? 'ok' : conclusion === 'failure' ? 'bad' : 'muted';
}

function SyncSection({ settings, onDispatched }: { settings: Settings; onDispatched: () => void }) {
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'sent' } | { status: 'error'; message: string }>(
    { status: 'idle' },
  );
  const runs = settings.github.runs ?? [];
  const latest = runs[0];
  const secretNames = new Set((settings.github.secrets ?? []).map((secret) => secret.name));

  const run = async () => {
    setState({ status: 'sending' });
    try {
      await dispatchSync();
      setState({ status: 'sent' });
      // GitHub takes a few seconds to list a dispatched run.
      setTimeout(onDispatched, 5000);
    } catch (cause) {
      setState({ status: 'error', message: describeError(cause) });
    }
  };

  return (
    <Section index="03" title="CONTENT SYNC" note={syncSchedule.toUpperCase()}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={!settings.github.configured || state.status === 'sending'}
          className={buttonTone.signal}
        >
          {state.status === 'sending' ? 'STARTING…' : 'RUN SYNC NOW'}
        </button>
        {state.status === 'sent' && (
          <span aria-live="polite" className="type-micro text-signal">
            STARTED — IT TAKES TWO OR THREE MINUTES, AND DEPLOYS IF ANYTHING CHANGED
          </span>
        )}
        {state.status === 'error' && (
          <span aria-live="polite" className="type-micro text-danger">
            {state.message.toUpperCase()}
          </span>
        )}
        {latest && (
          <span className="type-meta">
            LAST RUN {formatDateTime(latest.createdAt)} ·{' '}
            <span className={toneClass[runTone(latest.conclusion, latest.status)]}>
              {(latest.status === 'completed' ? latest.conclusion ?? '' : latest.status).toUpperCase()}
            </span>
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((source) => {
          const result = stepStatus(stepFor(settings.github.latestSteps, source.step));
          return (
            <article
              key={source.key}
              className="flex flex-col gap-1 rounded-standard border border-line bg-panel p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="type-title">{source.label}</h3>
                <span className={`type-micro ${toneClass[result.tone]}`}>{result.text}</span>
              </div>
              <p className="type-fine">{source.reads}</p>
              <dl className="m-0 mt-auto flex flex-col gap-0.5 border-t border-line pt-1">
                <Pair label="WRITES" value={source.collection} />
                <Pair label="SCRIPT" value={source.script} />
                <Pair
                  label="NEEDS"
                  value={
                    source.secrets.length === 0 ? (
                      'No credential'
                    ) : (
                      <span className="flex flex-wrap gap-x-1">
                        {source.secrets.map((name) => (
                          <span
                            key={name}
                            className={
                              settings.github.secrets
                                ? secretNames.has(name)
                                  ? 'text-ink'
                                  : 'text-danger'
                                : 'text-ink'
                            }
                          >
                            {name}
                          </span>
                        ))}
                      </span>
                    )
                  }
                />
                <Pair label="BREAKS" value={source.failsWhen} />
              </dl>
            </article>
          );
        })}
      </div>

      {runs.length > 0 && (
        <div className="mt-3 rounded-standard border border-line bg-panel p-2">
          <p className="type-micro text-signal">RECENT RUNS</p>
          <ul className="m-0 mt-1 flex list-none flex-col p-0">
            {runs.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-1 last:border-b-0"
              >
                <span className="type-meta">
                  {formatDateTime(entry.createdAt)} · {entry.event === 'schedule' ? 'SCHEDULED' : 'BY HAND'}
                </span>
                <a
                  href={entry.htmlUrl}
                  target="_blank"
                  rel="noopener"
                  className={`type-micro ${toneClass[runTone(entry.conclusion, entry.status)]} hover:opacity-80`}
                >
                  {(entry.status === 'completed' ? entry.conclusion ?? '' : entry.status).toUpperCase()} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/* --- 04 configuration ----------------------------------------------------- */

function yesNo(value: boolean, good: boolean = true): ReactNode {
  const tone: Tone = value === good ? 'ok' : 'warn';
  return <span className={toneClass[tone]}>{value ? 'YES' : 'NO'}</span>;
}

function ConfigurationSection({ settings }: { settings: Settings }) {
  const { api, github } = settings;
  const sha = import.meta.env.PUBLIC_BUILD_SHA ?? '';
  const repository = github.repository;

  return (
    <Section index="04" title="CONFIGURATION" note="WHAT THE SITE AND THE API RUN WITH">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel title="SITE BUILD">
          <Row label="HOST" value={`${window.location.origin}${import.meta.env.BASE_URL}`} />
          <Row label="API" value={import.meta.env.PUBLIC_API_URL || '—'} />
          <Row
            label="SIGN-IN"
            value={import.meta.env.PUBLIC_DISCORD_CLIENT_ID ? 'Discord (client id set)' : 'Not configured'}
          />
          <Row label="BUILT" value={formatDateTime(import.meta.env.PUBLIC_BUILD_AT)} />
          <Row
            label="COMMIT"
            value={
              sha ? (
                <a
                  href={`https://github.com/${repository}/commit/${sha}`}
                  target="_blank"
                  rel="noopener"
                  className="text-signal hover:opacity-80"
                >
                  {sha.slice(0, 7)} ↗
                </a>
              ) : (
                'Local build'
              )
            }
          />
          <Row label="SEARCH" value="Hidden — noindex on every page, robots.txt blocks crawlers" />
          <Row label="PREVIEWS" value="Allowed — link-preview bots may read the og: tags" />
        </Panel>

        <Panel title="API">
          <Row label="ENVIRONMENT" value={api.environment} />
          <Row label="RUNTIME" value={api.runtime} />
          <Row label="VERSION" value={`Site version ${api.siteVersion}`} />
          <Row label="ORIGINS" value={api.origins.join(' · ')} />
          <Row label="ORIGIN GATE" value={yesNo(api.enforceOrigin)} />
          <Row label="POSTGRES" value={api.postgres ? <span className="text-signal">REACHABLE</span> : <span className="text-danger">UNREACHABLE</span>} />
          <Row label="KEY VAULT" value={api.keyVault ?? <span className="text-[var(--color-fault-strain)]">NOT CONFIGURED</span>} />
          <Row label="TELEMETRY" value={api.appInsights ? 'Application Insights' : 'Off'} />
          <Row label="DISCORD" value={yesNo(api.discordSignIn)} />
          <Row label="GOOGLE" value={yesNo(api.googleSignIn)} />
          <Row label="SERVICE KEY" value={yesNo(api.serviceKey)} />
          <Row label="IP SALT" value={yesNo(api.ipHashSalt)} />
          <Row label="DEV SIGN-IN" value={yesNo(api.devSignIn, false)} />
        </Panel>

        <Panel title="GITHUB">
          <Row label="REPOSITORY" value={repository} />
          <Row label="WORKFLOW" value={`${github.workflow}${github.ref ? ` @ ${github.ref}` : ''}`} />
          <Row
            label="TOKEN"
            value={
              !github.configured ? (
                <span className="text-[var(--color-fault-strain)]">NOT CONFIGURED</span>
              ) : github.tokenExpiresAt ? (
                <span className={toneClass[expiryTone(github.tokenExpiresAt)]}>
                  EXPIRES {formatDate(github.tokenExpiresAt)}
                </span>
              ) : (
                'Set · no expiry reported'
              )
            }
          />
        </Panel>

        {github.secrets && (
          <Panel title="ACTIONS SECRETS" note="NAMES ONLY — GITHUB NEVER RETURNS VALUES">
            {github.secrets.map((secret) => (
              <Row key={secret.name} label={secret.name} value={`Updated ${formatDate(secret.updatedAt)}`} wide />
            ))}
          </Panel>
        )}

        {github.variables && github.variables.length > 0 && (
          <Panel title="ACTIONS VARIABLES">
            {github.variables.map((variable) => (
              <Row
                key={variable.name}
                label={variable.name}
                value={`${
                  /^\d{4}-\d{2}-\d{2}T/.test(variable.value)
                    ? formatDate(variable.value)
                    : variable.value || '(empty)'
                } · updated ${formatDate(variable.updatedAt)}`}
                wide
              />
            ))}
          </Panel>
        )}
      </div>
    </Section>
  );
}

/* --- layout pieces -------------------------------------------------------- */

function Section({
  index,
  title,
  note,
  children,
}: {
  index: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-baseline gap-2">
          <span className="type-meta text-signal">{index}</span>
          <span className="type-title">{title}</span>
        </h2>
        {note && <p className="type-meta">{note}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-standard border border-line bg-panel p-2">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="type-micro text-signal">{title}</p>
        {note && <p className="type-meta">{note}</p>}
      </div>
      <dl className="m-0 mt-1 flex flex-col">{children}</dl>
    </section>
  );
}

function Row({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-1 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className={`type-meta shrink-0 text-signal ${wide ? 'sm:w-26' : 'sm:w-16'} break-all`}>{label}</dt>
      <dd className="type-fine m-0 min-w-0 break-words text-ink">{value}</dd>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="type-meta w-8 shrink-0 text-muted">{label}</dt>
      <dd className="type-fine m-0 min-w-0 break-words">{value}</dd>
    </div>
  );
}
