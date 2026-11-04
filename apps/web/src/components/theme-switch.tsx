"use client";

import { useSyncExternalStore } from "react";
import { themeStorageKey } from "@/lib/theme";

const darkPreference = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const preference = window.matchMedia(darkPreference);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributeFilter: ["data-theme"],
  });
  preference.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    preference.removeEventListener("change", onChange);
  };
}

function isDark() {
  const theme = document.documentElement.dataset.theme;
  return (
    theme === "dark" || (!theme && window.matchMedia(darkPreference).matches)
  );
}

export function ThemeSwitch() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggleTheme() {
    const theme = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch {
      // The current page can still switch themes when storage is unavailable.
    }
  }

  return (
    <button
      type="button"
      className="theme-switch"
      role="switch"
      aria-label="Dark mode"
      aria-checked={dark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" />
          </>
        ) : (
          <path d="M20.9 13.35a9 9 0 0 1-10.25-10.25A9 9 0 1 0 20.9 13.35Z" />
        )}
      </svg>
    </button>
  );
}
