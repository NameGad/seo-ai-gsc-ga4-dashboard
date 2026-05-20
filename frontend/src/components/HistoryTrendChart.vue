<script setup>
import { Chart, BarController, BarElement, CategoryScale, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

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

function labelFor(row) {
  if (!row.capturedAt) return row.dateRange?.endDate || '-';
  const date = new Date(row.capturedAt);
  return Number.isNaN(date.getTime())
    ? String(row.capturedAt).slice(0, 10)
    : date.toLocaleString(undefined, {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
}

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
  const clickFill = cssVar('--chart-click-fill', 'rgba(37,99,235,.20)');
  const impressionColor = cssVar('--chart-impression', '#0f766e');
  const impressionFill = cssVar('--chart-impression-fill', 'rgba(15,118,110,.08)');

  chart = new Chart(canvasRef.value.getContext('2d'), {
    data: {
      labels: props.rows.map(labelFor),
      datasets: [
        {
          type: 'bar',
          label: 'Clicks',
          data: props.rows.map(row => row.clicks || 0),
          backgroundColor: clickFill,
          borderColor: clickColor,
          borderWidth: 1,
          borderRadius: 5,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Impressions',
          data: props.rows.map(row => row.impressions || 0),
          borderColor: impressionColor,
          backgroundColor: impressionFill,
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
        legend: {position: 'top', align: 'end', labels: {color: axisColor, usePointStyle: true, boxWidth: 8, boxHeight: 8}},
        tooltip: {backgroundColor: tooltipBg, padding: 12, cornerRadius: 8}
      },
      scales: {
        x: {grid: {display: false}, ticks: {color: axisColor}},
        y: {beginAtZero: true, grid: {color: gridColor}, ticks: {color: axisColor}},
        y1: {beginAtZero: true, position: 'right', grid: {drawOnChartArea: false}, ticks: {color: axisColor}}
      }
    }
  });
}

onMounted(render);
watch(() => props.rows, render, {deep: true});
watch(() => props.themeMode, render);
onBeforeUnmount(() => {
  if (chart) chart.destroy();
});
</script>

<template>
  <div class="chart-wrap compact">
    <canvas ref="canvasRef" />
  </div>
</template>
