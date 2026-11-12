<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import {
  audienceCsv,
  audienceStale,
  audienceStats,
  queryAudience,
  type AudienceFilter,
  type AudienceSnapshot,
} from '../audience'
import { getLocale, onLocaleChange, t as translate } from '../i18n'
const props = defineProps<{
  snapshot: AudienceSnapshot
  temporary?: boolean
  saved?: boolean
  status?: string
}>()
const emit = defineEmits<{ close: []; restart: [] }>()
const locale = ref(getLocale()),
  unsubscribe = onLocaleChange((value) => (locale.value = value))
onBeforeUnmount(unsubscribe)
const t: typeof translate = (key, params) =>
  translate(key, params, locale.value)
const filter = ref<AudienceFilter>({
    bin: -1,
    relation: 'all',
    sort: 'followers',
  }),
  page = ref(1),
  mobile = ref('overview'),
  confirmReset = ref(false)
const stats = computed(() => audienceStats(props.snapshot.members))
const matches = computed(() =>
  queryAudience(props.snapshot, filter.value, props.snapshot.updatedAt),
)
const pages = computed(() => Math.max(1, Math.ceil(matches.value.length / 12)))
const visible = computed(() =>
  matches.value.slice((page.value - 1) * 12, page.value * 12),
)
const following = computed(() => props.snapshot.kind === 'following')
const own = computed(
  () =>
    !!props.snapshot.account &&
    props.snapshot.account === props.snapshot.targetId,
)
const stale = computed(() => audienceStale(props.snapshot))
const bins = [
  '0–2,999',
  '3,000–9,999',
  '10,000–29,999',
  '30,000–49,999',
  '50,000–99,999',
  '100,000+',
]
const number = (v?: number) =>
  v === undefined ? '—' : v.toLocaleString(locale.value)
const date = (v: number) => new Date(v).toLocaleString(locale.value)
watch(filter, () => (page.value = 1), { deep: true })
watch(pages, () => (page.value = Math.min(page.value, pages.value)))
function reset() {
  filter.value = { bin: -1, relation: 'all', sort: 'followers' }
}
function restart() {
  emit('restart')
  confirmReset.value = false
}
function download() {
  const url = URL.createObjectURL(
    new Blob([audienceCsv(props.snapshot, matches.value)], {
      type: 'text/csv;charset=utf-8',
    }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.snapshot.handle}-${props.snapshot.kind}-${props.snapshot.batch}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>
<template>
  <div class="audience-panel">
    <header>
      <div>
        <span class="eyebrow">OH-MY-X · @{{ snapshot.handle }}</span>
        <h1 id="audience-title">
          {{ t(following ? 'audience.following' : 'audience.followers') }}
        </h1>
      </div>
      <button
        class="icon"
        :aria-label="t('audience.close')"
        @click="emit('close')"
      >
        ✕
      </button>
    </header>
    <div class="scope">
      <p>
        {{
          t('audience.scope', {
            count: stats.count,
            known: stats.known,
            unknown: stats.unknown,
          })
        }}<span v-if="snapshot.total !== undefined">
          · {{ t('audience.total', { total: number(snapshot.total) }) }}</span
        >
      </p>
      <p class="muted">
        {{
          t('audience.updated', {
            start: date(snapshot.startedAt),
            end: date(snapshot.updatedAt),
          })
        }}
      </p>
      <p class="muted">{{ t('audience.sample') }}</p>
    </div>
    <div
      v-if="temporary || stale || snapshot.limited || status"
      class="notice"
      role="status"
    >
      {{
        temporary
          ? t('audience.temporary')
          : status || (stale ? t('audience.stale') : t('audience.capacity'))
      }}
      <button
        v-if="stale && !saved && !temporary && !confirmReset"
        @click="confirmReset = true"
      >
        {{ t('audience.start') }}
      </button>
      <div v-if="confirmReset">
        <p>{{ t('audience.clearConfirm') }}</p>
        <button
          @click="restart"
        >
          {{ t('audience.confirm') }}
        </button>
        <button @click="confirmReset = false">
          {{ t('audience.cancel') }}
        </button>
      </div>
    </div>
    <nav
      v-if="!following"
      class="mobile-tabs"
      :aria-label="t('audience.accounts')"
    >
      <button
        :aria-pressed="mobile === 'overview'"
        @click="mobile = 'overview'"
      >
        {{ t('audience.overview') }}</button
      ><button :aria-pressed="mobile === 'list'" @click="mobile = 'list'">
        {{ t('audience.accounts') }}
      </button>
    </nav>
    <div
      class="scroll-area"
      :class="{ 'show-list': mobile === 'list', following }"
    >
      <section v-if="!following" class="summary">
        <div class="tiles">
          <div v-for="(n, i) in stats.cumulative" :key="i">
            <span class="muted">{{
              t('audience.threshold', {
                count: ['3,000', '10,000', '30,000'][i],
              })
            }}</span
            ><strong>{{ number(n) }}</strong
            ><span class="muted">{{
              stats.known ? ((n / stats.known) * 100).toFixed(1) + '%' : '—'
            }}</span>
          </div>
        </div>
        <p class="muted">{{ t('audience.cumulative') }}</p>
      </section>
      <div class="analysis-body">
        <aside v-if="!following" class="distribution">
          <h2>{{ t('audience.distribution') }}</h2>
          <button
            class="all-bin"
            :aria-pressed="filter.bin === -1"
            @click="filter.bin = -1"
          >
            {{ t('audience.all') }}
            <span>{{ number(stats.count) }}</span></button
          ><button
            v-for="(label, i) in bins"
            :key="label"
            class="bin"
            :aria-pressed="filter.bin === i"
            @click="filter.bin = i"
          >
            <span
              ><span v-if="filter.bin === i" aria-hidden="true">✓ </span
              >{{ label }}</span
            ><span
              >{{ number(stats.bins[i]) }} ·
              {{
                stats.known
                  ? ((stats.bins[i] / stats.known) * 100).toFixed(1) + '%'
                  : '—'
              }}</span
            ><i
              :style="{
                width:
                  (stats.known ? (stats.bins[i] / stats.known) * 100 : 0) + '%',
              }"
            ></i>
          </button>
          <p class="muted">{{ t('audience.unknown') }}：{{ stats.unknown }}</p>
          <button class="primary mobile-view" @click="mobile = 'list'">
            {{ t('audience.viewResults', { count: matches.length }) }}
          </button>
        </aside>
        <section class="accounts">
          <div v-if="following" class="filters">
            <fieldset v-if="own">
              <legend>{{ t('audience.relationship') }}</legend>
              <button
                v-for="value in ['all', 'no', 'yes', 'unknown'] as const"
                :key="value"
                :aria-pressed="filter.relation === value"
                @click="filter.relation = value"
              >
                {{ t(`audience.${value}`) }}
              </button>
              <p class="muted">{{ t('audience.relationHint') }}</p>
            </fieldset>
            <p v-else class="muted">{{ t('audience.thirdParty') }}</p>
            <div class="checks">
              <label
                ><input v-model="filter.large" type="checkbox" />{{
                  t('audience.large')
                }}</label
              ><label
                ><input v-model="filter.recent" type="checkbox" />{{
                  t('audience.recent')
                }}</label
              ><label
                ><input v-model="filter.small" type="checkbox" />{{
                  t('audience.small')
                }}</label
              >
            </div>
          </div>
          <div class="search-row">
            <input
              v-model="filter.search"
              type="search"
              :placeholder="t('audience.search')"
              :aria-label="t('audience.search')"
            /><select v-model="filter.sort" :aria-label="t('audience.sort')">
              <option value="followers">
                {{ t('audience.sortFollowers') }}
              </option>
              <option v-if="following" value="ratio">
                {{ t('audience.sortRatio') }}
              </option>
            </select>
          </div>
          <div class="results-head">
            <h2>
              {{ t('audience.results', { count: matches.length })
              }}<span v-if="(filter.bin ?? -1) >= 0">
                · {{ bins[filter.bin!] }}</span
              >
            </h2>
            <button class="text-button" @click="reset">
              {{ t('audience.resetFilters') }}
            </button>
          </div>
          <div v-if="!snapshot.members.length" class="empty">
            <h2>{{ t('audience.empty') }}</h2>
            <p>{{ t('audience.emptyHint') }}</p>
          </div>
          <p v-else-if="!matches.length" class="empty">
            {{ t('audience.noResults') }}
          </p>
          <div v-else class="member-list" :class="{ table: following }">
            <article v-for="member in visible" :key="member.id">
              <a
                class="identity"
                :href="`https://x.com/${member.handle}`"
                target="_blank"
                rel="noopener noreferrer"
                ><img
                  v-if="member.avatar"
                  :src="member.avatar"
                  alt=""
                  loading="lazy"
                  referrerpolicy="no-referrer"
                /><span v-else class="avatar" aria-hidden="true">{{
                  member.handle[0].toUpperCase()
                }}</span
                ><span
                  ><b>{{ member.name || member.handle }}</b
                  ><small>@{{ member.handle }}</small></span
                ></a
              >
              <div class="metrics">
                <span
                  ><small>{{ t('audience.followersCount') }}</small
                  ><b>{{ number(member.followers) }}</b></span
                ><span v-if="following"
                  ><small>{{ t('audience.followingCount') }}</small
                  ><b>{{ number(member.following) }}</b></span
                ><span v-if="following"
                  ><small>{{ t('audience.ratio') }}</small
                  ><b>{{
                    member.followers !== undefined && member.following
                      ? (member.followers / member.following).toFixed(2)
                      : '—'
                  }}</b></span
                >
              </div>
              <div v-if="following" class="member-extra">
                <span
                  >{{ t('audience.created') }}：{{
                    member.createdAt
                      ? new Date(member.createdAt).toLocaleDateString(locale)
                      : '—'
                  }}</span
                ><span v-if="own" class="relation">{{
                  t(
                    member.followsYou === true
                      ? 'audience.yes'
                      : member.followsYou === false
                        ? 'audience.no'
                        : 'audience.unknown',
                  )
                }}</span>
              </div>
            </article>
          </div>
          <div class="pagination">
            <button :disabled="page <= 1" @click="page--">
              {{ t('audience.prev') }}</button
            ><span aria-live="polite">{{
              t('audience.page', { page, pages })
            }}</span
            ><button :disabled="page >= pages" @click="page++">
              {{ t('audience.next') }}
            </button>
          </div>
        </section>
      </div>
    </div>
    <footer>
      <button :disabled="!matches.length" @click="download">
        {{ t('audience.export') }}</button
      ><button class="primary" @click="emit('close')">
        {{ t(saved ? 'audience.close' : 'audience.continue') }}
      </button>
    </footer>
  </div>
</template>
