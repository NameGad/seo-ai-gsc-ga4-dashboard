export function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

export function defaultDateRange() {
  const end = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);
  return {
    startDate: formatDateInput(start),
    endDate: formatDateInput(end)
  };
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

export function formatPct(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

export function detectShopifyType(url = '') {
  if (url.includes('/blogs/')) return 'Blog';
  if (url.includes('/collections/')) return 'Collection';
  if (url.includes('/products/')) return 'Product';
  return 'Other';
}
