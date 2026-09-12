<script setup lang="ts">
import { useAuthProviders } from './composables/useAuthProviders';

const {
  mode,
  providers,
  ui,
  loading,
  loadError,
  queryError,
  queryReason,
  hasProviders,
  startUrl,
} = useAuthProviders();
</script>

<template>
  <main class="card">
    <div class="hero">
      <div class="logo" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3l7 3v5.5c0 4.4-2.9 8.4-7 9.5-4.1-1.1-7-5.1-7-9.5V6l7-3z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
          <path
            d="M9.2 12.2l1.9 1.9 3.8-4"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <div>
        <h1>{{ ui.loginHeading }}</h1>
        <p class="sub">{{ ui.loginSubtitle }}</p>
      </div>
    </div>

    <div v-if="queryError" class="alert" role="alert">
      <strong>{{ queryError }}</strong>
      <div v-if="queryReason" class="alert-sub">{{ queryReason }}</div>
    </div>

    <div v-if="loading" class="status">正在加载登录方式…</div>
    <div v-else-if="loadError" class="alert">
      <strong>无法加载登录选项</strong>
      <div class="alert-sub">{{ loadError }}</div>
    </div>
    <div v-else-if="!hasProviders" class="status">
      尚未启用任何 OAuth 登录。请配置密钥并在 KV 中打开 provider。
    </div>

    <div v-else class="stack">
      <a v-for="p in providers" :key="p.id" class="btn" :href="startUrl(p.id)">
        <span v-if="p.id === 'github' && ui.showGithubIcon" class="btn-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.32.1-2.75 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.9-1.32 2.74-1.05 2.74-1.05.55 1.43.2 2.49.1 2.75.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.38-.01 2.48-.01 2.82 0 .26.18.58.69.48A10.27 10.27 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"
            />
          </svg>
        </span>
        {{ ui.providerButtonPrefix }} {{ p.displayName }} 登录
      </a>
    </div>

    <div class="footer">
      <div class="footer-row">
        <span v-if="ui.showFooterBrand">{{ ui.footerBrand }}</span>
        <span v-else></span>
        <span
          v-if="ui.showModeBadge"
          class="badge"
          :class="mode === 'strict' ? 'strict' : 'normal'"
        >
          {{ mode === 'strict' ? '严格模式' : '普通模式' }}
        </span>
      </div>
      <div v-if="ui.copyright || ui.icp" class="legal">
        <span v-if="ui.copyright">{{ ui.copyright }}</span>
        <a
          v-if="ui.icp"
          class="legal-link"
          :href="ui.icpLink || 'https://beian.miit.gov.cn/'"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ ui.icp }}
        </a>
      </div>
    </div>
  </main>
</template>

<style scoped>
.card {
  width: 100%;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 32px 28px 24px;
  box-shadow: var(--shadow);
}

.hero {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 22px;
}

.logo {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(145deg, #3b82f6, #0ea5e9);
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28);
  flex-shrink: 0;
}

h1 {
  margin: 0;
  font-size: 1.25rem;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.sub {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}

.stack {
  display: grid;
  gap: 10px;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 46px;
  border-radius: 12px;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  color: #1d4ed8;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    background 0.12s ease;
}

.btn:hover {
  background: #dbeafe;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
  transform: translateY(-1px);
  text-decoration: none;
}

.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.alert {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--danger-bg);
  color: var(--danger-ink);
  border: 1px solid var(--danger-border);
  font-size: 0.9rem;
  line-height: 1.45;
}

.alert-sub {
  margin-top: 4px;
  opacity: 0.92;
  font-size: 0.85rem;
}

.status {
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 12px;
}

.footer {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--muted);
  font-size: 0.8rem;
}

.footer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.legal {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.legal-link {
  color: var(--muted);
  text-decoration: none;
}

.legal-link:hover {
  color: var(--accent);
}

.badge {
  display: inline-flex;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #f8fafc;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge.strict {
  color: #b45309;
  background: #fffbeb;
  border-color: #fde68a;
}

.badge.normal {
  color: #047857;
  background: #ecfdf5;
  border-color: #a7f3d0;
}
</style>
