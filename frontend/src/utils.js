export function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export const PAGE_TYPES = ['All', 'Collection', 'Product', 'Blog', 'Other'];

export function detectShopifyType(url = '') {
  const value = String(url).toLowerCase();
  let pathname = value;
  try {
    pathname = new URL(value).pathname.toLowerCase();
  } catch (err) {
    pathname = value.split('?')[0].split('#')[0];
  }

  if (pathname.includes('/collections/')) return 'Collection';
  if (pathname.includes('/products/')) return 'Product';
  if (pathname.includes('/blogs/') || pathname.includes('/blog/')) return 'Blog';
  return 'Other';
}
