<script setup>
import { Chart, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip, CategoryScale } from 'chart.js';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

const props = defineProps({
  rows: {
    type: Array,
    default: () => []
  },
  themeMode: {
    type: String,
    default: 'light'
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

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function render() {
  if (!canvasRef.value) return;
  if (chart) chart.destroy();
  const axisColor = cssVar('--chart-axis', '#667085');
  const gridColor = cssVar('--chart-grid', '#edf1f4');
  const tooltipBg = cssVar('--chart-tooltip', '#111827');
  const clickColor = cssVar('--chart-click', '#2563eb');
  const clickFill = cssVar('--chart-click-fill', 'rgba(37,99,235,.10)');
  const impressionColor = cssVar('--chart-impression', '#0f766e');
  const impressionFill = cssVar('--chart-impression-fill', 'rgba(15,118,110,.08)');

  chart = new Chart(canvasRef.value.getContext('2d'), {
    type: 'line',
    data: {
      labels: props.rows.map(row => row.date),
      datasets: [
        {
          label: 'Clicks',
          data: props.rows.map(row => row.clicks || 0),
          borderColor: clickColor,
          backgroundColor: clickFill,
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
          borderColor: impressionColor,
          backgroundColor: impressionFill,
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
        legend: { position: 'top', align: 'end', labels: { color: axisColor, usePointStyle: true, boxWidth: 8, boxHeight: 8 } },
        tooltip: { backgroundColor: tooltipBg, padding: 12, cornerRadius: 8, displayColors: true }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, color: axisColor } },
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: axisColor } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: axisColor } }
      }
    }
  });
}

onMounted(render);
watch(rowsSignature, render);
watch(() => props.themeMode, render);
onBeforeUnmount(() => {
  if (chart) chart.destroy();
});
</script>

<template>
  <div class="chart-wrap">
    <canvas ref="canvasRef" />
  </div>
</template>
