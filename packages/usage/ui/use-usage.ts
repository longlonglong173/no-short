import { useEffect, useRef, useState } from 'react';
import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import { decodeResult } from './model';
import type { DashboardResult } from '../src/types';

declare global {
  interface Window { openai?: { toolResponseMetadata?: unknown; widgetState?: unknown; setWidgetState?: (state: object) => void; callTool?: (name: string, args: object) => Promise<unknown> } }
}
export function useUsage() {
  const [data, setData] = useState<DashboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const preview = import.meta.env.DEV && window.parent === window;
  useEffect(() => {
    let alive = true, tornDown = false, pending = false, received = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let initial: ReturnType<typeof setTimeout> | undefined;
    let app: App | undefined;
    let call: (() => Promise<unknown>) | undefined;
    function accept(result: unknown) {
      const next = decodeResult(result);
      if (next && alive) { received = true; setData(next); setError(null); setBusy(false); }
    }
    async function refresh() {
      if (!alive || tornDown || pending || !call) return;
      pending = true; setBusy(true);
      try {
        const value = await call();
        if (!decodeResult(value)) throw new Error('Incompatible result');
        accept(value);
      } catch {
        if (alive) setError('Không cập nhật được thống kê. Kiểm tra kết nối plugin rồi thử lại.');
      } finally { pending = false; if (alive) setBusy(false); }
    }
    refreshRef.current = refresh;
    function visibility() {
      clearInterval(interval); interval = undefined;
      if (document.visibilityState === 'visible' && alive && !tornDown && call) interval = setInterval(() => { void refresh(); }, 15_000);
    }
    function stop() { tornDown = true; clearInterval(interval); clearTimeout(initial); }
    const onLegacyResult = () => accept(window.openai?.toolResponseMetadata);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('openai:set_globals', onLegacyResult);
    window.addEventListener('pagehide', stop);
    async function start() {
      if (preview) {
        call = async () => {
          const response = await fetch('/__usage/snapshot', { cache: 'no-store' });
          if (!response.ok) throw new Error('Preview unavailable');
          return { _meta: { usage: await response.json() } };
        };
        visibility(); await refresh(); return;
      }
      if (window.parent === window) {
        setError('Mở No Short Usage từ plugin no-short trong Codex Desktop để đọc thống kê.'); setBusy(false); return;
      }
      app = new App({ name: 'No Short Usage', version: '0.4.1' }, {});
      app.ontoolresult = accept;
      const theme = (context: any) => {
        if (context?.theme) { applyDocumentTheme(context.theme); document.documentElement.dataset.theme = context.theme; }
        if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
      };
      app.onhostcontextchanged = theme;
      app.onteardown = async () => { stop(); return {}; };
      onLegacyResult();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([app.connect(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Host timeout')), 8_000); })]);
        theme(app.getHostContext());
        call = () => app!.callServerTool({ name: 'get_usage_dashboard', arguments: {} });
      } catch {
        await app.close().catch(() => {});
        if (window.openai?.callTool) call = () => window.openai!.callTool!('get_usage_dashboard', {});
        else if (alive) { setError('Host chưa kết nối được panel. Hãy cập nhật Desktop và mở lại plugin.'); setBusy(false); }
      } finally { clearTimeout(timer); }
      if (!alive || tornDown) return;
      visibility();
      // Tool-result handlers are registered before the handshake to retain the initial result.
      if (!received && call) initial = setTimeout(() => { void refresh(); }, 150);
    }
    void start().catch(() => { if (alive) { setError('Không khởi tạo được panel. Hãy mở lại plugin.'); setBusy(false); } });
    return () => {
      alive = false; stop(); document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('openai:set_globals', onLegacyResult); window.removeEventListener('pagehide', stop);
      void app?.close().catch(() => {});
    };
  }, [preview]);
  return { data, busy, error, preview, refresh: () => refreshRef.current() };
}
