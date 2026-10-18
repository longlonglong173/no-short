import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { resolveLanguage, translate, type Language } from './localization';
let pendingWidgetState: Record<string, unknown> = {};
// Some hosts apply setWidgetState asynchronously. Keep our own recent fields
// so switching languages and pinning in quick succession cannot overwrite each other.
export function persistWidgetState(patch: Record<string, unknown>) {
  const host = window.openai?.widgetState;
  pendingWidgetState = { ...(host && typeof host === 'object' ? host : {}), ...pendingWidgetState, ...patch };
  try { window.openai?.setWidgetState?.(pendingWidgetState); } catch { /* Optional host state. */ }
}
const storageKey = 'no-short-usage-language-v1';
function readLanguage(): Language {
  let saved: unknown;
  const host = window.openai?.widgetState as { noShortUsageLanguage?: unknown } | undefined;
  saved = host?.noShortUsageLanguage;
  if (!saved) { try { saved = localStorage.getItem(storageKey); } catch { /* Optional storage. */ } }
  return resolveLanguage(saved, navigator.languages ?? [navigator.language]);
}
const LanguageContext = createContext({
  language: 'en' as Language,
  setLanguage: (_: Language) => {},
  l: (key: string, ...args: string[]) => translate('en', key, ...args)
});
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState(readLanguage);
  const userChosen = useRef(false);
  useEffect(() => {
    // Legacy hosts may restore widget state after the iframe has mounted.
    const restore = () => { if (!userChosen.current) updateLanguage(readLanguage()); };
    window.addEventListener('openai:set_globals', restore);
    return () => window.removeEventListener('openai:set_globals', restore);
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  function setLanguage(value: Language) {
    userChosen.current = true;
    updateLanguage(value);
    try { localStorage.setItem(storageKey, value); } catch { /* Host storage may be blocked. */ }
    persistWidgetState({ noShortUsageLanguage: value });
  }
  return <LanguageContext.Provider value={{ language, setLanguage, l: (key, ...args) => translate(language, key, ...args) }}>{children}</LanguageContext.Provider>;
}
export const useTranslation = () => useContext(LanguageContext);
