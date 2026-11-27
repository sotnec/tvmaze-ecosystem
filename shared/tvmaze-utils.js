(function (global) {
  'use strict';

  const CACHE_PREFIX = 'tvmaze_cache:';
  const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function copyTextToClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && global.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    fallbackCopy(text);
    return Promise.resolve();
  }

  function fallbackCopy(text) {
    if (typeof document === 'undefined') return;
    const tempArea = document.createElement('textarea');
    tempArea.value = text;
    tempArea.style.position = 'fixed';
    tempArea.style.opacity = '0';
    document.body.appendChild(tempArea);
    tempArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Failed to copy', err);
    } finally {
      document.body.removeChild(tempArea);
    }
  }

  function showToast(msg, iconClass = 'fa-circle-check text-emerald-400') {
    if (typeof document === 'undefined') return;
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    const toastIcon = document.getElementById('toastIcon');
    if (!toast || !toastMsg) return;

    toastMsg.innerText = msg;
    if (toastIcon) {
      toastIcon.className = `fa-solid ${iconClass}`;
    }

    toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    setTimeout(() => {
      toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
    }, 2500);
  }

  function readCachedJson(url, ttlMs) {
    if (typeof sessionStorage === 'undefined' || ttlMs <= 0) return null;
    try {
      const raw = sessionStorage.getItem(CACHE_PREFIX + url);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - parsed.ts > ttlMs) {
        sessionStorage.removeItem(CACHE_PREFIX + url);
        return null;
      }
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function writeCachedJson(url, data) {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {
      // Ignore storage quota errors
    }
  }

  async function fetchJsonWithRetry(url, retries = 2, cacheTtlMs = DEFAULT_CACHE_TTL_MS) {
    const cached = readCachedJson(url, cacheTtlMs);
    if (cached !== null) return cached;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(url);
      if (response.status === 429 && attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      writeCachedJson(url, data);
      return data;
    }
    throw new Error('Request failed after retries');
  }

  async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function runWorker() {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index], index);
      }
    }

    const workerCount = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return results;
  }

  function matchesSelectedLanguage(showLang, elementId = 'langSelect') {
    const selected = (typeof document !== 'undefined' && document.getElementById(elementId)?.value) || 'ALL';
    if (selected === 'ALL') return true;
    return (showLang || '').toLowerCase() === selected.toLowerCase();
  }

  function matchesSelectedType(showType, elementId = 'typeSelect') {
    const selected = (typeof document !== 'undefined' && document.getElementById(elementId)?.value) || 'ALL';
    if (selected === 'ALL') return true;
    return (showType || '').toLowerCase() === selected.toLowerCase();
  }

  function matchesSelectedYear(premieredDate, elementId = 'yearSelect') {
    const selectedEra = (typeof document !== 'undefined' && document.getElementById(elementId)?.value) || 'ALL';
    if (selectedEra === 'ALL') return true;
    if (!premieredDate) return false;

    const year = parseInt(String(premieredDate).substring(0, 4), 10);
    if (isNaN(year)) return false;

    if (selectedEra === '2020') return year >= 2020;
    if (selectedEra === '2010') return year >= 2010 && year <= 2019;
    if (selectedEra === '2000') return year >= 2000 && year <= 2009;
    if (selectedEra === '1990') return year >= 1990 && year <= 1999;
    if (selectedEra === 'OLDER') return year < (typeof document !== 'undefined' && document.querySelector(`#${elementId} option[value="1990"]`) ? 1990 : 2000);
    return true;
  }

  function getSafeCheckedShows() {
    if (typeof localStorage === 'undefined') return {};
    try {
      const stored = localStorage.getItem('tvmaze_checked_shows');
      if (!stored) return {};
      const parsed = JSON.parse(stored);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveCheckedShows(checkedShows) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('tvmaze_checked_shows', JSON.stringify(checkedShows));
    } catch (e) {}
  }

  function getQueryParam(name) {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get(name) || '';
  }

  const api = {
    escapeHtml,
    copyTextToClipboard,
    showToast,
    fetchJsonWithRetry,
    mapWithConcurrency,
    matchesSelectedLanguage,
    matchesSelectedType,
    matchesSelectedYear,
    getSafeCheckedShows,
    saveCheckedShows,
    getQueryParam
  };

  global.TvmazeUtils = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
