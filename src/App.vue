<template>
  <main class="container">
    <input
      id="tokenAddress"
      v-model.trim="tokenAddress"
      type="text"
      class="token-input"
      placeholder="Enter Solana token address and press Enter"
      :disabled="loading"
      @keyup.enter="handleSubmit"
      aria-label="Solana token address"
      required
    />

    <p v-if="statusMessage" :class="['status-message', { error: hasError }]" aria-live="polite">
      {{ statusMessage }}
    </p>

    <section v-if="combinedResponse" class="json-section">
      <button
        type="button"
        class="copy-button"
        @click="copyJsonToClipboard"
        :disabled="!formattedJson"
      >
        Copy JSON
      </button>
      <p v-if="copyFeedback" class="copy-feedback" aria-live="polite">{{ copyFeedback }}</p>
      <pre class="json-output">{{ formattedJson }}</pre>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { fetchAggregatedTokenData } from './services/tokenData';

const tokenAddress = ref('');
const loading = ref(false);
const statusMessage = ref('');
const hasError = ref(false);
const combinedResponse = ref(null);
const copyFeedback = ref('');
let copyTimeoutId;

const apiKey = import.meta.env.VITE_MORALIS_API_KEY ?? '';
const hasApiKey = computed(() => Boolean(apiKey));

async function handleSubmit() {
  if (loading.value) {
    return;
  }

  statusMessage.value = '';
  hasError.value = false;
  combinedResponse.value = null;
  copyFeedback.value = '';

  if (!tokenAddress.value) {
    statusMessage.value = 'Please enter a token address.';
    hasError.value = true;
    return;
  }

  if (!hasApiKey.value) {
    statusMessage.value = 'Moralis API key is not configured.';
    hasError.value = true;
    return;
  }

  loading.value = true;
  statusMessage.value = 'Fetching token data…';

  try {
    const aggregated = await fetchAggregatedTokenData(tokenAddress.value, { apiKey });
    combinedResponse.value = aggregated;
    statusMessage.value = '';
  } catch (error) {
    hasError.value = true;
    statusMessage.value = error instanceof Error ? error.message : 'Unable to fetch token data.';
  } finally {
    loading.value = false;
  }
}

const formattedJson = computed(() =>
  combinedResponse.value ? JSON.stringify(combinedResponse.value, null, 2) : '',
);

function copyUsingTextarea(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const successful = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!successful) {
    throw new Error('Fallback copy command was unsuccessful.');
  }
}

async function copyJsonToClipboard() {
  if (!formattedJson.value) {
    return;
  }

  const jsonText = formattedJson.value;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(jsonText);
    } else {
      copyUsingTextarea(jsonText);
    }
    copyFeedback.value = 'JSON copied to clipboard!';
  } catch (error) {
    console.error('Failed to copy JSON to clipboard', error);
    try {
      copyUsingTextarea(jsonText);
      copyFeedback.value = 'JSON copied to clipboard!';
    } catch (fallbackError) {
      console.error('Fallback copy failed', fallbackError);
      copyFeedback.value = 'Unable to copy JSON.';
    }
  } finally {
    clearTimeout(copyTimeoutId);
    copyTimeoutId = setTimeout(() => {
      copyFeedback.value = '';
    }, 2000);
  }
}

onBeforeUnmount(() => {
  clearTimeout(copyTimeoutId);
});
</script>

<style scoped>
.container {
  margin: 0 auto;
  padding: 3rem 1.5rem;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.token-input {
  width: 100%;
  padding: 1rem 1.25rem;
  border-radius: 0.75rem;
  border: 1px solid #cbd5f5;
  font-size: 1rem;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

.token-input:disabled {
  opacity: 0.6;
}

.status-message {
  margin: 0;
  font-size: 0.95rem;
  color: #1f2937;
}

.status-message.error {
  color: #b91c1c;
}

.json-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.copy-button {
  align-self: flex-start;
  background: #1d4ed8;
  color: #f8fafc;
  border: none;
  padding: 0.6rem 1rem;
  border-radius: 0.6rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease;
  box-shadow: 0 10px 25px rgba(29, 78, 216, 0.25);
}

.copy-button:hover:not(:disabled) {
  background: #1e40af;
}

.copy-button:active:not(:disabled) {
  transform: translateY(1px);
}

.copy-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.copy-feedback {
  margin: 0;
  font-size: 0.85rem;
  color: #38bdf8;
}

.json-output {
  background: #0f172a;
  color: #f8fafc;
  padding: 1.5rem;
  border-radius: 1rem;
  overflow: auto;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9rem;
}
</style>
