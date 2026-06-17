'use client';

import { useState } from 'react';

export function PasswordInput({
  name,
  placeholder,
  autoComplete,
}: {
  name: string;
  placeholder: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-full">
      <input
        type={visible ? 'text' : 'password'}
        name={name}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-4 pr-16 text-base text-black outline-none transition-colors placeholder:text-[#999] focus:border-[#001B5C]"
        autoComplete={autoComplete}
        required
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#001B5C]"
        tabIndex={-1}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
