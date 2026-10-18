// Installer interactions for the No Short Skills introduction only.
(() => {
  const commands = {
    cli: 'npx skills add longlonglong173/no-short-skills --all',
    codex: 'codex plugin marketplace add longlonglong173/no-short-skills\ncodex plugin add no-short-skills@no-short-skills',
    claude: '/plugin marketplace add longlonglong173/no-short-skills\n/plugin install no-short-skills@no-short-skills'
  };
  const notes = {
    en: {
      cli: 'Installs skills for supported agents. Choose your agent and install location when prompted.',
      codex: 'Run these commands in your terminal, then start a new Codex chat.',
      claude: 'Run these commands in Claude Code, then start a new session.'
    },
    'zh-CN': {
      cli: '为支持的 agent 安装 skill。按安装程序提示选择 agent 和安装位置。',
      codex: '在终端中运行这些命令，然后新建一个 Codex 聊天。',
      claude: '在 Claude Code 中运行这些命令，然后开始新会话。'
    },
    vi: {
      cli: 'Cài skill cho các agent được hỗ trợ. Chọn agent và nơi cài khi trình cài hỏi.',
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
  const language = () => Object.hasOwn(notes, document.documentElement.lang) ? document.documentElement.lang : 'en';
  const localized = (en, vi, zh) => ({ en, vi, 'zh-CN': zh })[language()];
  const announce = message => { document.getElementById('announcement').textContent = message; };

  function resetCopy() {
    copyVersion++;
    clearTimeout(timer);
    copy.querySelector('[data-i18n]').textContent = localized('Copy', 'Sao chép', '复制');
  }

  function render() {
    command.textContent = commands[selected];
    document.getElementById('install-note').textContent = notes[language()][selected];
    document.getElementById('command-label').textContent = selected === 'claude' ? 'CLAUDE CODE' : localized('TERMINAL', 'TERMINAL', '终端');
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
      copy.querySelector('[data-i18n]').textContent = localized('Copied ✓', 'Đã chép ✓', '已复制 ✓');
      announce(localized('Installation command copied.', 'Đã sao chép lệnh cài đặt.', '已复制安装命令。'));
      clearTimeout(timer);
      timer = setTimeout(resetCopy, 2400);
    } catch {
      if (version !== copyVersion) return;
      const range = document.createRange();
      range.selectNodeContents(command);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copy.querySelector('[data-i18n]').textContent = localized('Copy manually', 'Chép thủ công', '手动复制');
      announce(localized('Clipboard unavailable. The command is selected for you to copy manually.', 'Không thể truy cập clipboard. Lệnh đã được chọn để bạn sao chép thủ công.', '无法访问剪贴板。已选中命令，请手动复制。'));
    }
  });
  window.addEventListener('no-short-languagechange', render);
  render();
})();
