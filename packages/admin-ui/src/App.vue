<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  apiLogin,
  apiLogout,
  apiSaveAuth,
  apiSaveUi,
  apiState,
} from './api';
import type { GuardConfig, ProviderRules, UiConfig } from './types';

const locked = ref(false);
const needLogin = ref(false);
const loading = ref(true);
const msg = ref('');
const msgErr = ref(false);
const password = ref('');
const tab = ref<'rules' | 'ui'>('rules');

const auth = reactive<GuardConfig>({
  mode: 'normal',
  providers: {
    github: { enabled: true, rules: {} },
  },
});

const ui = reactive<UiConfig>({
  siteTitle: '受保护站点',
  siteSubtitle: '登录后继续访问',
  loginHeading: '访问受保护站点',
  loginSubtitle: '使用已授权账号登录后继续浏览',
  providerButtonPrefix: '使用',
  footerBrand: 'cf-static-guard',
  copyright: '',
  icp: '',
  icpLink: 'https://beian.miit.gov.cn/',
  showModeBadge: true,
  showFooterBrand: true,
  showGithubIcon: true,
});

const form = reactive({
  ghEnabled: true,
  ghMode: '' as '' | 'normal' | 'strict',
  minAge: '' as string | number,
  allowlist: '',
  blocklist: '',
  requiredOrgs: '',
  requiredTeams: '',
  emailDomains: '',
});

const hasKv = ref(false);
const githubConfigured = ref(false);
const appVisible = computed(() => !needLogin.value && !locked.value);

function show(text: string, isErr = false) {
  msg.value = text;
  msgErr.value = isErr;
  if (!isErr) setTimeout(() => (msg.value = ''), 2500);
}

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function listToLines(list?: string[]): string {
  return (list || []).join('\n');
}

function applyState(data: Awaited<ReturnType<typeof apiState>>) {
  Object.assign(auth, data.auth);
  Object.assign(ui, data.ui);
  hasKv.value = data.hasKv;
  githubConfigured.value = data.githubConfigured;
  if (!data.hasAdminPassword) {
    locked.value = true;
    return;
  }
  locked.value = false;

  const gh = data.auth.providers.github || { enabled: true, rules: {} };
  const rules: ProviderRules = gh.rules || {};
  form.ghEnabled = gh.enabled !== false;
  form.ghMode = gh.mode || '';
  form.minAge = rules.minAccountAgeDays ?? '';
  form.allowlist = listToLines(rules.allowlist);
  form.blocklist = listToLines(rules.blocklist);
  form.requiredOrgs = listToLines(rules.requiredOrgs);
  form.requiredTeams = listToLines(
    (rules.requiredTeams || []).map((t) => `${t.org}/${t.team}`),
  );
  form.emailDomains = listToLines(rules.emailDomainAllowlist);
}

async function load() {
  loading.value = true;
  try {
    const data = await apiState();
    needLogin.value = false;
    applyState(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'unauthorized') {
      needLogin.value = true;
    } else if (message === 'admin_disabled') {
      locked.value = true;
    } else {
      // state endpoint requires auth; show login
      needLogin.value = true;
    }
  } finally {
    loading.value = false;
  }
}

async function doLogin() {
  try {
    await apiLogin(password.value);
    password.value = '';
    needLogin.value = false;
    await load();
    show('登录成功');
  } catch (e) {
    show(e instanceof Error ? e.message : '登录失败', true);
  }
}

async function doLogout() {
  try {
    await apiLogout();
  } catch {
    // ignore
  }
  needLogin.value = true;
}

async function saveRules() {
  try {
    const ageRaw = String(form.minAge).trim();
    const rules: ProviderRules = {
      allowlist: linesToList(form.allowlist),
      blocklist: linesToList(form.blocklist),
      requiredOrgs: linesToList(form.requiredOrgs),
      requiredTeams: linesToList(form.requiredTeams)
        .map((line) => {
          const [org, team] = line.split('/').map((s) => s.trim());
          return { org: org || '', team: team || '' };
        })
        .filter((t) => t.org && t.team),
      emailDomainAllowlist: linesToList(form.emailDomains),
    };
    if (ageRaw !== '') rules.minAccountAgeDays = Number(ageRaw);

    const next: GuardConfig = {
      mode: auth.mode,
      providers: {
        github: {
          enabled: form.ghEnabled,
          mode: form.ghMode || undefined,
          rules,
        },
      },
    };
    const data = await apiSaveAuth(next);
    Object.assign(auth, data.auth);
    show('规则已保存');
    await load();
  } catch (e) {
    show(e instanceof Error ? e.message : '保存失败', true);
  }
}

async function saveUi() {
  try {
    const data = await apiSaveUi({ ...ui });
    Object.assign(ui, data.ui);
    show('文案已保存');
  } catch (e) {
    show(e instanceof Error ? e.message : '保存失败', true);
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>守卫管理后台</h1>
        <p class="sub">修改访问规则、登录文案与页脚备案信息。配置保存在 KV，即时生效。</p>
      </div>
      <div class="actions" style="margin: 0">
        <a class="btn ghost" href="/auth/login" target="_blank">预览登录页</a>
        <button v-if="!needLogin && !locked" class="btn ghost" type="button" @click="doLogout">
          退出
        </button>
      </div>
    </div>

    <div v-if="msg" class="alert" :class="{ err: msgErr }">{{ msg }}</div>

    <div v-if="loading" class="card">加载中…</div>

    <div v-else-if="locked" class="card">
      <h2>管理后台未启用</h2>
      <p class="hint">
        请在 Worker 中设置 Secret <code>ADMIN_PASSWORD</code>，然后重新部署。设置后访问
        <code>/admin</code> 即可登录管理。
      </p>
    </div>

    <div v-else-if="needLogin" class="card">
      <h2>管理员登录</h2>
      <p class="hint">密码来自 Secret <code>ADMIN_PASSWORD</code></p>
      <label class="field-label">密码</label>
      <input
        v-model="password"
        type="password"
        autocomplete="current-password"
        @keyup.enter="doLogin"
      />
      <div class="actions">
        <button class="btn primary" type="button" @click="doLogin">登录</button>
      </div>
    </div>

    <div v-else-if="appVisible" class="card">
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: tab === 'rules' }"
          type="button"
          @click="tab = 'rules'"
        >
          访问规则
        </button>
        <button
          class="tab"
          :class="{ active: tab === 'ui' }"
          type="button"
          @click="tab = 'ui'"
        >
          文案与页脚
        </button>
      </div>

      <section v-show="tab === 'rules'" class="stack">
        <div class="row">
          <div>
            <label class="field-label">全局模式</label>
            <select v-model="auth.mode">
              <option value="normal">普通模式（OAuth 成功即可）</option>
              <option value="strict">严格模式（执行已配置规则）</option>
            </select>
            <div class="hint">
              严格规则判定：仅校验「已填写」的字段；未填写的规则跳过。黑名单在两种模式下都会拒绝。
            </div>
          </div>
          <div>
            <label class="field-label">GitHub 启用</label>
            <select v-model="form.ghEnabled">
              <option :value="true">启用</option>
              <option :value="false">停用</option>
            </select>
            <div class="hint" v-if="!githubConfigured">尚未配置 GitHub Client ID/Secret</div>
          </div>
        </div>
        <div class="row">
          <div>
            <label class="field-label">GitHub 模式（覆盖全局，可选）</label>
            <select v-model="form.ghMode">
              <option value="">跟随全局</option>
              <option value="normal">普通</option>
              <option value="strict">严格</option>
            </select>
          </div>
          <div>
            <label class="field-label">最少账号年龄（天，留空不校验）</label>
            <input v-model="form.minAge" type="number" min="0" placeholder="例如 30" />
          </div>
        </div>
        <div>
          <label class="field-label">白名单 allowlist（每行一个 login 或 github:login）</label>
          <textarea v-model="form.allowlist" placeholder="alice&#10;github:bob" />
        </div>
        <div>
          <label class="field-label">黑名单 blocklist（普通/严格都会拒绝）</label>
          <textarea v-model="form.blocklist" />
        </div>
        <div>
          <label class="field-label">必须加入的组织 requiredOrgs（每行一个）</label>
          <textarea v-model="form.requiredOrgs" placeholder="your-org" />
        </div>
        <div>
          <label class="field-label">必须加入的团队 requiredTeams（每行 org/team）</label>
          <textarea v-model="form.requiredTeams" placeholder="your-org/docs-readers" />
        </div>
        <div>
          <label class="field-label">邮箱域名白名单（每行一个域名）</label>
          <textarea v-model="form.emailDomains" placeholder="example.com" />
        </div>
        <div class="actions">
          <button class="btn primary" type="button" @click="saveRules">保存规则</button>
        </div>
        <p class="hint" v-if="!hasKv">未绑定 KV（RULES），保存会失败。请先创建 KV namespace 并写入 wrangler.toml。</p>
      </section>

      <section v-show="tab === 'ui'" class="stack">
        <div class="row">
          <div>
            <label class="field-label">站点标题</label>
            <input v-model="ui.siteTitle" type="text" />
          </div>
          <div>
            <label class="field-label">站点副标题</label>
            <input v-model="ui.siteSubtitle" type="text" />
          </div>
        </div>
        <div class="row">
          <div>
            <label class="field-label">登录页主标题</label>
            <input v-model="ui.loginHeading" type="text" />
          </div>
          <div>
            <label class="field-label">登录页说明</label>
            <input v-model="ui.loginSubtitle" type="text" />
          </div>
        </div>
        <div class="row">
          <div>
            <label class="field-label">按钮前缀（「使用」GitHub 登录）</label>
            <input v-model="ui.providerButtonPrefix" type="text" />
          </div>
          <div>
            <label class="field-label">页脚品牌名</label>
            <input v-model="ui.footerBrand" type="text" />
          </div>
        </div>
        <div class="row">
          <div>
            <label class="field-label">版权信息 copyright</label>
            <input v-model="ui.copyright" type="text" placeholder="© 2026 Your Name" />
          </div>
          <div>
            <label class="field-label">ICP 备案号</label>
            <input v-model="ui.icp" type="text" placeholder="京ICP备xxxxxxxx号" />
          </div>
        </div>
        <div>
          <label class="field-label">ICP 链接</label>
          <input v-model="ui.icpLink" type="text" placeholder="https://beian.miit.gov.cn/" />
        </div>
        <div class="checks">
          <label class="check">
            <input v-model="ui.showModeBadge" type="checkbox" />
            显示模式徽章（普通/严格）
          </label>
          <label class="check">
            <input v-model="ui.showFooterBrand" type="checkbox" />
            显示页脚品牌名
          </label>
          <label class="check">
            <input v-model="ui.showGithubIcon" type="checkbox" />
            GitHub 按钮显示图标
          </label>
        </div>
        <div class="actions">
          <button class="btn primary" type="button" @click="saveUi">保存文案</button>
        </div>
        <p class="hint">
          文案通过 <code>GET /ui-config</code> 提供给登录页；改完刷新登录页即可看到。
        </p>
      </section>
    </div>
  </div>
</template>
