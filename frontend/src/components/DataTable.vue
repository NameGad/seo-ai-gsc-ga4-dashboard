<script setup>
defineProps({
  rows: {
    type: Array,
    default: () => []
  },
  columns: {
    type: Array,
    required: true
  },
  numericColumns: {
    type: Array,
    default: () => ['Clicks', 'Impressions', 'CTR', 'Position']
  }
});
</script>

<template>
  <div class="table-wrap">
    <div v-if="rows.length === 0" class="empty">No data</div>
    <table v-else>
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="index">
          <td
            v-for="column in columns"
            :key="column"
            :class="{ num: numericColumns.includes(column) }"
          >
            {{ row[column] ?? '' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
