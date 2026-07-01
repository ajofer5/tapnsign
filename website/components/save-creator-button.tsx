'use client';

import { useState } from 'react';

export function SaveCreatorButton({
  creatorId,
  initialSaved,
  loginPath,
}: {
  creatorId: string;
  initialSaved: boolean;
  loginPath: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (loading) return;
    if (!initialSaved && loginPath) {
      // If not logged in, loginPath will be set to the login URL
    }
    setLoading(true);
    const method = saved ? 'DELETE' : 'POST';
    try {
      const res = await fetch('/api/save-creator', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_id: creatorId }),
      });
      if (res.status === 401) {
        window.location.href = loginPath;
        return;
      }
      if (res.ok) setSaved((prev) => !prev);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="mt-3 rounded-full border border-[#001B5C] px-4 py-1.5 text-xs font-semibold text-[#001B5C] transition-colors hover:bg-[#001B5C] hover:text-white disabled:opacity-50"
    >
      {saved ? 'Unsave Creator' : 'Save Creator'}
    </button>
  );
}
