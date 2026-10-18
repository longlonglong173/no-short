// Installer interactions for the No Short Skills introduction only.
(() => {
  const commands = {
    cli: 'npx skills add longlonglong173/no-short-skills --all',
    codex: 'codex plugin marketplace add longlonglong173/no-short-skills\ncodex plugin add no-short-skills@no-short-skills',
    claude: '/plugin marketplace add longlonglong173/no-short-skills\n/plugin install no-short-skills@no-short-skills'
  };
  const notes = {
    en: {
      cli: 'Installs the published instruction-based skills for supported agents. Review the installer’s prompts for your setup.',
      codex: 'Run these commands in your terminal, then start a new Codex chat.',
      claude: 'Run these commands in Claude Code, then start a new session.'
    },
    vi: {
      cli: 'Cài các skill dạng hướng dẫn cho agent được hỗ trợ. Xem các lựa chọn của trình cài cho thiết lập của bạn.',
      codex: 'Chạy các lệnh này trong terminal, rồi bắt đầu một chat Codex mới.',
      claude: 'Chạy các lệnh này trong Claude Code, rồi bắt đầu một phiên mới.'
    }
  };
  const tabs = [...document.querySelectorAll('[data-install]')];
  const command = document.getElementById('install-command');
  const copy = document.getElementById('copy-command');
  let selected = 'cli';
  let copyVersion = 0;
  let timer;
  const language = () => document.documentElement.lang === 'vi' ? 'vi' : 'en';
  const announce = message => { document.getElementById('announcement').textContent = message; };

  function resetCopy() {
    copyVersion++;
    clearTimeout(timer);
    copy.querySelector('[data-i18n]').textContent = language() === 'vi' ? 'Sao chép' : 'Copy';
  }

  function render() {
    command.textContent = commands[selected];
    document.getElementById('install-note').textContent = notes[language()][selected];
    document.getElementById('command-label').textContent = selected === 'claude' ? 'CLAUDE CODE' : 'TERMINAL';
    document.getElementById('install-panel').setAttribute('aria-labelledby', `tab-${selected}`);
    for (const tab of tabs) {
      const active = tab.dataset.install === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    resetCopy();
  }

  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => { selected = tab.dataset.install; render(); });
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selected = tabs[next].dataset.install;
      render();
      tabs[next].focus();
    });
  }

  copy.addEventListener('click', async () => {
    const version = ++copyVersion;
    try {
      await navigator.clipboard.writeText(commands[selected]);
      if (version !== copyVersion) return;
      copy.querySelector('[data-i18n]').textContent = language() === 'vi' ? 'Đã chép ✓' : 'Copied ✓';
      announce(language() === 'vi' ? 'Đã sao chép lệnh cài đặt.' : 'Installation command copied.');
      clearTimeout(timer);
      timer = setTimeout(resetCopy, 2400);
    } catch {
      if (version !== copyVersion) return;
      const range = document.createRange();
      range.selectNodeContents(command);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copy.querySelector('[data-i18n]').textContent = language() === 'vi' ? 'Chép thủ công' : 'Copy manually';
      announce(language() === 'vi' ? 'Không thể truy cập clipboard. Lệnh đã được chọn để bạn sao chép thủ công.' : 'Clipboard unavailable. The command is selected for you to copy manually.');
    }
  });
  window.addEventListener('no-short-languagechange', render);
  render();
})();
