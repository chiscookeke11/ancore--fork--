import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionKeysPanel, type SessionKeySummary } from '../SessionKeysPanel';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock('@ancore/ui-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ancore/ui-kit')>();
  return { ...actual, useToast: () => ({ toast }) };
});

const NOW_MS = 100_000;
const keys: SessionKeySummary[] = [
  {
    publicKey: 'GACTIVEKEY000000000000000000000000000000000000000000000000000000',
    expiresAt: 200,
    label: 'Phone',
  },
  {
    publicKey: 'GSECONDKEY00000000000000000000000000000000000000000000000000000',
    expiresAt: 300,
    label: 'Laptop',
  },
  {
    publicKey: 'GEXPIREDKEY0000000000000000000000000000000000000000000000000000',
    expiresAt: 50,
    label: 'Old device',
  },
];

describe('SessionKeysPanel bulk revocation confirmation', () => {
  beforeEach(() => {
    toast.mockClear();
  });

  it('shows the number of active keys and does not revoke anything before confirmation', () => {
    const onRevoke = vi.fn();
    render(<SessionKeysPanel keys={keys} nowMs={NOW_MS} onRevoke={onRevoke} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke all 2 active session keys' }));

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/This will revoke 2 active keys/)).toBeTruthy();
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it('cancels bulk revocation without invoking the revoke callback', () => {
    const onRevoke = vi.fn();
    render(<SessionKeysPanel keys={keys} nowMs={NOW_MS} onRevoke={onRevoke} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke all 2 active session keys' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it('revokes each active key only after confirmation', async () => {
    const onRevoke = vi.fn().mockResolvedValue(undefined);
    render(<SessionKeysPanel keys={keys} nowMs={NOW_MS} onRevoke={onRevoke} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke all 2 active session keys' }));
    expect(onRevoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Revoke' }));

    await waitFor(() => {
      expect(onRevoke).toHaveBeenCalledTimes(2);
    });
    expect(onRevoke).toHaveBeenNthCalledWith(1, keys[0].publicKey);
    expect(onRevoke).toHaveBeenNthCalledWith(2, keys[1].publicKey);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('moves focus into the dialog and returns focus to the trigger after cancel', () => {
    render(<SessionKeysPanel keys={keys} nowMs={NOW_MS} onRevoke={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Revoke all 2 active session keys' });

    fireEvent.click(trigger);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);

    fireEvent.click(cancel);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes the confirmation dialog when Escape is pressed', () => {
    render(<SessionKeysPanel keys={keys} nowMs={NOW_MS} onRevoke={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke all 2 active session keys' }));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
