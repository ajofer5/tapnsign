'use client';

import { useTransition } from 'react';
import { togglePrintsAction } from '../app/(app)/collection/actions';

type Props = {
  autographId: string;
  enabled: boolean;
};

export function CollectionPrintsToggle({ autographId, enabled }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(() => {
      void togglePrintsAction(autographId, !enabled);
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`shrink-0 rounded-[4px] px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
        enabled
          ? 'bg-[#001B5C] text-white hover:bg-[#00144A]'
          : 'border border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-800'
      }`}
    >
      {isPending ? '…' : enabled ? 'Public Prints On' : 'Public Prints Off'}
    </button>
  );
}
