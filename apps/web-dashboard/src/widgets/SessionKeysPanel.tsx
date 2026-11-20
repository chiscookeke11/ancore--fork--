import React from 'react';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@ancore/ui-kit';
import { useToast } from '@ancore/ui-kit';
import { AlertCircle, Copy, Key, RefreshCw, Trash2 } from 'lucide-react';
import { isSessionKeyActive } from '@ancore/core-sdk';
import { formatRelativeExpiry } from '../utils/time';
import { WidgetErrorBoundary } from './WidgetErrorBoundary';

export interface SessionKeySummary {
  publicKey: string;
  /** Unix timestamp in seconds. `0` indicates a revoked key. */
  expiresAt: number;
  label?: string;
}

export interface SessionKeysPanelProps {
  keys?: SessionKeySummary[];
  isLoading?: boolean;
  error?: Error | null;
  /** Override "now" (ms) for deterministic rendering / testnet mocks. */
  nowMs?: number;
  className?: string;
  onRetry?: () => void;
  onRevoke?: (publicKey: string) => void | Promise<void>;
  shouldThrowOnError?: boolean;
}

function truncatePublicKey(pk: string): string {
  if (pk.length <= 14) return pk;
  return `${pk.slice(0, 8)}…${pk.slice(-4)}`;
}

/**
 * Read-only panel listing session keys with an active/expired badge.
 *
 * Uses {@link isSessionKeyActive} from `@ancore/core-sdk` to derive the badge
 * so the UI stays in sync with the on-chain semantics implemented by the
 * account contract. The `nowMs` prop makes the component deterministic for
 * tests and for testnet mocks.
 */
export const SessionKeysPanel: React.FC<SessionKeysPanelProps> = ({
  keys,
  isLoading,
  error,
  nowMs,
  className = '',
  onRetry,
  onRevoke,
  shouldThrowOnError = false,
}) => {
  const { toast } = useToast();
  const [isBulkRevokeOpen, setIsBulkRevokeOpen] = React.useState(false);
  const bulkRevokeTriggerRef = React.useRef<HTMLButtonElement>(null);
  const confirmationRef = React.useRef<HTMLDivElement>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const activeKeys = (keys ?? []).filter((key) =>
    isSessionKeyActive(
      { expiresAt: key.expiresAt, publicKey: key.publicKey },
      nowMs !== undefined ? { nowMs } : undefined
    )
  );

  const closeBulkRevoke = () => setIsBulkRevokeOpen(false);

  React.useEffect(() => {
    if (!isBulkRevokeOpen) return;

    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeBulkRevoke();
        return;
      }

      if (event.key !== 'Tab' || !confirmationRef.current) return;
      const buttons = Array.from(
        confirmationRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      );
      if (buttons.length === 0) return;

      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      bulkRevokeTriggerRef.current?.focus();
    };
  }, [isBulkRevokeOpen]);

  const confirmBulkRevoke = async () => {
    closeBulkRevoke();
    for (const key of activeKeys) {
      await revokeSessionKey(key.publicKey);
    }
  };

  if (error && shouldThrowOnError) {
    throw error;
  }

  const copyPublicKey = async (publicKey: string) => {
    try {
      await navigator.clipboard.writeText(publicKey);
      toast('Key ID copied to clipboard', 'success', 3000);
    } catch {
      toast('Unable to copy key ID', 'error', 3000);
    }
  };

  const revokeSessionKey = async (publicKey: string) => {
    try {
      await onRevoke?.(publicKey);
      toast('Session key revoked', 'success', 3000);
    } catch {
      toast('Unable to revoke session key', 'error', 3000);
    }
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Session Keys</CardTitle>
        <div className="flex items-center gap-2">
          {onRevoke && activeKeys.length > 0 && (
            <button
              ref={bulkRevokeTriggerRef}
              type="button"
              onClick={() => setIsBulkRevokeOpen(true)}
              className="text-xs font-medium text-destructive hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={`Revoke all ${activeKeys.length} active session keys`}
            >
              Revoke all ({activeKeys.length})
            </button>
          )}
          <Key className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div data-testid="session-keys-loading" className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ) : error ? (
          <div
            className="flex flex-col items-center justify-center p-4 text-center space-y-2 text-destructive"
            data-testid="session-keys-error"
          >
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium text-red-800">
                {error.message || 'Unable to load session keys'}
              </span>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-md transition-colors"
                data-testid="session-keys-retry-button"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            )}
          </div>
        ) : !keys || keys.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="session-keys-empty">
            No session keys.
          </p>
        ) : (
          <ul className="divide-y divide-border" data-testid="session-keys-list">
            {keys.map((key) => {
              const active = isSessionKeyActive(
                { expiresAt: key.expiresAt, publicKey: key.publicKey },
                nowMs !== undefined ? { nowMs } : undefined
              );
              return (
                <li
                  key={key.publicKey}
                  className="flex items-center justify-between gap-3 py-2"
                  data-testid="session-key-row"
                >
                  <span className="min-w-0 truncate font-mono text-xs text-foreground">
                    {key.label ?? truncatePublicKey(key.publicKey)}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={new Date(key.expiresAt * 1000).toISOString()}
                      title={new Date(key.expiresAt * 1000).toISOString()}
                    >
                      {formatRelativeExpiry(key.expiresAt, nowMs)}
                    </time>
                    <Badge
                      variant={active ? 'default' : 'secondary'}
                      className={
                        active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }
                    >
                      {active ? 'Active' : 'Expired'}
                    </Badge>
                    <button
                      type="button"
                      aria-label={`Copy ${key.label ?? 'session key'} ID`}
                      title="Copy key ID"
                      onClick={() => void copyPublicKey(key.publicKey)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {onRevoke && (
                      <button
                        type="button"
                        aria-label={`Revoke ${key.label ?? 'session key'}`}
                        title="Revoke session key"
                        onClick={() => void revokeSessionKey(key.publicKey)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {isBulkRevokeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            ref={confirmationRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="session-key-revoke-title"
            aria-describedby="session-key-revoke-description"
            className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl"
          >
            <h2 id="session-key-revoke-title" className="text-base font-semibold">
              Revoke all active session keys?
            </h2>
            <p id="session-key-revoke-description" className="mt-2 text-sm text-muted-foreground">
              This will revoke {activeKeys.length} active {activeKeys.length === 1 ? 'key' : 'keys'}.
              Connected dApps and automated tasks using these keys will lose access.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                onClick={closeBulkRevoke}
                className="rounded-md border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmBulkRevoke()}
                className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Confirm Revoke
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

/**
 * SessionKeys widget wrapped in WidgetErrorBoundary for isolated error boundary + retry.
 */
export const SessionKeysWidget: React.FC<SessionKeysPanelProps> = (props) => {
  return (
    <WidgetErrorBoundary onReset={props.onRetry}>
      <SessionKeysPanel {...props} shouldThrowOnError={true} />
    </WidgetErrorBoundary>
  );
};

export const SessionKeys = SessionKeysWidget;

export default SessionKeys;
