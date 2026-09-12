import { computed, onMounted, ref } from 'vue';
import { fetchProviders, fetchUiConfig } from '../api';
import type { ProviderInfo, UiConfig } from '../types';
import { defaultUi } from '../api';

export function useAuthProviders() {
  const mode = ref('normal');
  const providers = ref<ProviderInfo[]>([]);
  const ui = ref<UiConfig>(defaultUi());
  const loading = ref(true);
  const loadError = ref('');
  const queryError = ref('');
  const queryReason = ref('');
  const nextPath = ref('/');

  function safeNext(raw: string | null): string {
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return '/';
  }

  async function load() {
    loading.value = true;
    loadError.value = '';
    try {
      const [pData, uiData] = await Promise.all([
        fetchProviders(),
        fetchUiConfig(),
      ]);
      mode.value = pData.mode || 'normal';
      providers.value = pData.providers || [];
      ui.value = uiData;
    } catch (e) {
      loadError.value =
        e instanceof Error ? e.message : 'failed to load providers';
    } finally {
      loading.value = false;
    }
  }

  const hasProviders = computed(() => providers.value.length > 0);

  function startUrl(id: string): string {
    return `/auth/start/${encodeURIComponent(id)}?next=${encodeURIComponent(nextPath.value)}`;
  }

  onMounted(() => {
    const params = new URLSearchParams(window.location.search);
    queryError.value = params.get('error') || '';
    queryReason.value = params.get('reason') || '';
    nextPath.value = safeNext(params.get('next'));
    void load();
  });

  return {
    mode,
    providers,
    ui,
    loading,
    loadError,
    queryError,
    queryReason,
    hasProviders,
    startUrl,
    nextPath,
  };
}
