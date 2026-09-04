<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import PageBody from '@/components/layout/PageBody.vue'
import KButton from '@/components/ui/KButton.vue'
import KCard from '@/components/ui/KCard.vue'
import KEmptyState from '@/components/ui/KEmptyState.vue'

const { t } = useI18n()
</script>

<template>
  <div>
    <AppTopbar title="404" />
    <PageBody>
      <KCard :padded="false">
        <KEmptyState :title="t('machine.notFound.title')" :body="t('machine.notFound.body')">
          <RouterLink to="/">
            <KButton variant="primary">{{ t('actions.back') }}</KButton>
          </RouterLink>
        </KEmptyState>
      </KCard>
    </PageBody>
  </div>
</template>
