async function loadSession() {
  try {
    const res = await fetch('/auth/me', { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const data = await res.json();
    const el = document.createElement('div');
    el.className = 'chip';
    el.title = `provider=${data.provider}`;
    el.textContent = `@${data.login}`;
    const chips = document.querySelector('.chips');
    if (chips && data.authenticated) chips.appendChild(el);
  } catch {
    // ignore
  }
}

loadSession();
