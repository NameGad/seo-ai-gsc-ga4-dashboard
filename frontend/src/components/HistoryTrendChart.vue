<script setup>
import { Chart, BarController, BarElement, CategoryScale, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

const props = defineProps({
  rows: {
    type: Array,
    default: () => []
  }
});

const canvasRef = ref(null);
let chart;

function labelFor(row) {
  if (!row.capturedAt) return row.dateRange?.endDate || '-';
  const date = new Date(row.capturedAt);
  return Number.isNaN(date.getTime())
    ? String(row.capturedAt).slice(0, 10)
    : date.toLocaleString(undefined, {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
}

function render() {
  if (!canvasRef.value) return;
  if (chart) chart.destroy();

  chart = new Chart(canvasRef.value.getContext('2d'), {
    data: {
      labels: props.rows.map(labelFor),
      datasets: [
        {
          type: 'bar',
          label: 'Clicks',
          data: props.rows.map(row => row.clicks || 0),
          backgroundColor: 'rgba(37,99,235,.20)',
          borderColor: '#2563eb',
          borderWidth: 1,
          borderRadius: 5,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Impressions',
          data: props.rows.map(row => row.impressions || 0),
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15,118,110,.08)',
          tension: .35,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {mode: 'index', intersect: false},
      plugins: {
        legend: {position: 'top', align: 'end', labels: {usePointStyle: true, boxWidth: 8, boxHeight: 8}},
        tooltip: {backgroundColor: '#111827', padding: 12, cornerRadius: 8}
      },
      scales: {
        x: {grid: {display: false}, ticks: {color: '#667085'}},
        y: {beginAtZero: true, grid: {color: '#edf1f4'}, ticks: {color: '#667085'}},
        y1: {beginAtZero: true, position: 'right', grid: {drawOnChartArea: false}, ticks: {color: '#667085'}}
      }
    }
  });
}

onMounted(render);
watch(() => props.rows, render, {deep: true});
onBeforeUnmount(() => {
  if (chart) chart.destroy();
});
</script>

<template>
  <div class="chart-wrap compact">
    <canvas ref="canvasRef" />
  </div>
</template>
