<script setup>
import { Chart, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip, CategoryScale } from 'chart.js';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

const props = defineProps({
  rows: {
    type: Array,
    default: () => []
  }
});

const canvasRef = ref(null);
let chart;

const rowsSignature = computed(() => props.rows.map(row => [
  row.date,
  Math.round(Number(row.clicks || 0)),
  Math.round(Number(row.impressions || 0)),
  Number(row.position || 0).toFixed(4)
].join(':')).join('|'));

function render() {
  if (!canvasRef.value) return;
  if (chart) chart.destroy();

  chart = new Chart(canvasRef.value.getContext('2d'), {
    type: 'line',
    data: {
      labels: props.rows.map(row => row.date),
      datasets: [
        {
          label: 'Clicks',
          data: props.rows.map(row => row.clicks || 0),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,.10)',
          tension: .35,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Impressions',
          data: props.rows.map(row => row.impressions || 0),
          borderColor: '#0f766e',
          backgroundColor: 'rgba(15,118,110,.08)',
          tension: .35,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: true,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
        tooltip: { backgroundColor: '#111827', padding: 12, cornerRadius: 8, displayColors: true }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, color: '#667085' } },
        y: { beginAtZero: true, grid: { color: '#edf1f4' }, ticks: { color: '#667085' } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#667085' } }
      }
    }
  });
}

onMounted(render);
watch(rowsSignature, render);
onBeforeUnmount(() => {
  if (chart) chart.destroy();
});
</script>

<template>
  <div class="chart-wrap">
    <canvas ref="canvasRef" />
  </div>
</template>
