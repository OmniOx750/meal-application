(function () {
  'use strict';

  const api = window.MealAPI;
  const WEEKDAY_COUNT = 5;
  const state = {
    weekDates: [],
    days: new Map(),
    selectedDate: '',
    dashboardMode: 'week',
    dashboardData: null
  };

  let password = sessionStorage.getItem('mealAdminPassword') || '';

  const els = {
    loginCard: document.getElementById('loginCard'),
    loginForm: document.getElementById('loginForm'),
    adminPassword: document.getElementById('adminPassword'),
    loginButton: document.getElementById('loginButton'),
    loginMessage: document.getElementById('loginMessage'),
    adminArea: document.getElementById('adminArea'),
    dashboardAnchor: document.getElementById('dashboardAnchor'),
    dashboardPeriodLabel: document.getElementById('dashboardPeriodLabel'),
    dashboardPreviousButton: document.getElementById('dashboardPreviousButton'),
    dashboardTodayButton: document.getElementById('dashboardTodayButton'),
    dashboardNextButton: document.getElementById('dashboardNextButton'),
    dashboardRefreshButton: document.getElementById('dashboardRefreshButton'),
    dashboardTotalMeals: document.getElementById('dashboardTotalMeals'),
    dashboardLunchMeals: document.getElementById('dashboardLunchMeals'),
    dashboardDinnerMeals: document.getElementById('dashboardDinnerMeals'),
    dashboardTotalCost: document.getElementById('dashboardTotalCost'),
    dashboardMessage: document.getElementById('dashboardMessage'),
    trendChart: document.getElementById('trendChart'),
    manageDate: document.getElementById('manageDate'),
    weekRange: document.getElementById('weekRange'),
    previousWeekButton: document.getElementById('previousWeekButton'),
    todayButton: document.getElementById('todayButton'),
    nextWeekButton: document.getElementById('nextWeekButton'),
    loadButton: document.getElementById('loadButton'),
    logoutButton: document.getElementById('logoutButton'),
    weekSettingsBody: document.getElementById('weekSettingsBody'),
    saveWeekButton: document.getElementById('saveWeekButton'),
    saveMessage: document.getElementById('saveMessage'),
    refreshButton: document.getElementById('refreshButton'),
    selectedDayTitle: document.getElementById('selectedDayTitle'),
    responseTitle: document.getElementById('responseTitle'),
    responseBody: document.getElementById('responseBody'),
    lunchApplyCount: document.getElementById('lunchApplyCount'),
    lunchNoCount: document.getElementById('lunchNoCount'),
    dinnerApplyCount: document.getElementById('dinnerApplyCount'),
    dinnerNoCount: document.getElementById('dinnerNoCount'),
    selectedTotalMeals: document.getElementById('selectedTotalMeals'),
    selectedTotalCost: document.getElementById('selectedTotalCost')
  };

  els.loginForm.addEventListener('submit', login);
  els.dashboardPreviousButton.addEventListener('click', () => moveDashboardPeriod(-1));
  els.dashboardTodayButton.addEventListener('click', () => {
    els.dashboardAnchor.value = todayString();
    loadDashboard();
  });
  els.dashboardNextButton.addEventListener('click', () => moveDashboardPeriod(1));
  els.dashboardRefreshButton.addEventListener('click', loadDashboard);
  els.dashboardAnchor.addEventListener('change', loadDashboard);
  document.querySelectorAll('[data-dashboard-mode]').forEach((button) => {
    button.addEventListener('click', () => changeDashboardMode(button.dataset.dashboardMode));
  });

  els.previousWeekButton.addEventListener('click', () => moveWeek(-7));
  els.todayButton.addEventListener('click', () => {
    els.manageDate.value = todayString();
    loadWeek();
  });
  els.nextWeekButton.addEventListener('click', () => moveWeek(7));
  els.loadButton.addEventListener('click', loadWeek);
  els.saveWeekButton.addEventListener('click', saveWeek);
  els.refreshButton.addEventListener('click', refreshSelectedDay);
  els.logoutButton.addEventListener('click', logout);

  els.manageDate.value = todayString();
  els.dashboardAnchor.value = todayString();

  if (password) {
    els.adminPassword.value = password;
    login(new Event('submit'));
  }

  async function login(event) {
    event.preventDefault();
    password = els.adminPassword.value;
    if (!password) return;

    setButtonBusy(els.loginButton, true, '확인 중');
    setMessage(els.loginMessage, '', 'muted');

    try {
      await api.post('admin.verify', { password });
      sessionStorage.setItem('mealAdminPassword', password);
      els.loginCard.classList.add('hidden');
      els.adminArea.classList.remove('hidden');
      await loadDashboard();
      await loadWeek();
    } catch (error) {
      password = '';
      sessionStorage.removeItem('mealAdminPassword');
      setMessage(els.loginMessage, error.message, 'error');
    } finally {
      setButtonBusy(els.loginButton, false, '로그인');
    }
  }

  function logout() {
    password = '';
    state.days.clear();
    state.weekDates = [];
    state.selectedDate = '';
    state.dashboardData = null;
    sessionStorage.removeItem('mealAdminPassword');
    els.adminPassword.value = '';
    els.adminArea.classList.add('hidden');
    els.loginCard.classList.remove('hidden');
    setMessage(els.loginMessage, '로그아웃되었습니다.', 'muted');
  }

  function changeDashboardMode(mode) {
    state.dashboardMode = mode;
    document.querySelectorAll('[data-dashboard-mode]').forEach((button) => {
      const active = button.dataset.dashboardMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    loadDashboard();
  }

  function moveDashboardPeriod(direction) {
    const anchor = parseDate(els.dashboardAnchor.value || todayString());
    if (state.dashboardMode === 'day') anchor.setDate(anchor.getDate() + direction);
    if (state.dashboardMode === 'week') anchor.setDate(anchor.getDate() + direction * 7);
    if (state.dashboardMode === 'month') anchor.setMonth(anchor.getMonth() + direction);
    els.dashboardAnchor.value = dateString(anchor);
    loadDashboard();
  }

  async function loadDashboard() {
    if (!password) return;
    const anchorDate = els.dashboardAnchor.value || todayString();
    setDashboardBusy(true);
    setMessage(els.dashboardMessage, '', 'muted');

    try {
      const data = await api.post('admin.getDashboard', {
        password,
        mode: state.dashboardMode,
        anchorDate
      });
      state.dashboardData = data;
      renderDashboard(data);
    } catch (error) {
      handleAdminError(error, els.dashboardMessage);
      els.trendChart.innerHTML = '<p class="chart-empty">대시보드를 불러오지 못했습니다.</p>';
    } finally {
      setDashboardBusy(false);
    }
  }

  function renderDashboard(data) {
    const summary = data.summary || {};
    els.dashboardPeriodLabel.textContent = data.periodLabel || '-';
    els.dashboardTotalMeals.textContent = `${formatNumber(summary.totalMeals || 0)}식`;
    els.dashboardLunchMeals.textContent = `${formatNumber(summary.lunchApply || 0)}식`;
    els.dashboardDinnerMeals.textContent = `${formatNumber(summary.dinnerApply || 0)}식`;
    els.dashboardTotalCost.textContent = `${formatNumber(summary.totalCost || 0)}원`;
    renderTrendChart(data.series || []);
  }

  function renderTrendChart(series) {
    if (!series.length) {
      els.trendChart.innerHTML = '<p class="chart-empty">표시할 기간 데이터가 없습니다.</p>';
      return;
    }

    const width = 960;
    const height = 250;
    const margin = { top: 18, right: 24, bottom: 40, left: 44 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxValue = Math.max(1, ...series.flatMap((item) => [item.lunch || 0, item.dinner || 0]));
    const tickMax = Math.max(5, Math.ceil(maxValue / 5) * 5);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'trend-svg');
    svg.setAttribute('aria-hidden', 'true');

    const x = (index) => series.length === 1
      ? margin.left + plotWidth / 2
      : margin.left + (plotWidth * index) / (series.length - 1);
    const y = (value) => margin.top + plotHeight - (Math.max(0, value) / tickMax) * plotHeight;

    for (let index = 0; index <= 4; index += 1) {
      const value = Math.round((tickMax / 4) * index);
      const yPosition = y(value);
      svg.appendChild(svgLine(ns, margin.left, yPosition, width - margin.right, yPosition, 'chart-grid-line'));
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', margin.left - 10);
      label.setAttribute('y', yPosition + 4);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('class', 'chart-axis-label');
      label.textContent = String(value);
      svg.appendChild(label);
    }

    const lunchPath = buildPath(series, x, y, 'lunch');
    const dinnerPath = buildPath(series, x, y, 'dinner');
    svg.appendChild(svgPath(ns, lunchPath, 'chart-line lunch-line'));
    svg.appendChild(svgPath(ns, dinnerPath, 'chart-line dinner-line'));

    const labelStep = series.length > 16 ? 4 : series.length > 9 ? 2 : 1;
    series.forEach((item, index) => {
      const xPosition = x(index);
      appendPoint(svg, ns, xPosition, y(item.lunch || 0), 'lunch-point', `${item.date} 중식 ${item.lunch || 0}식`);
      appendPoint(svg, ns, xPosition, y(item.dinner || 0), 'dinner-point', `${item.date} 석식 ${item.dinner || 0}식`);

      if (index % labelStep === 0 || index === series.length - 1) {
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', xPosition);
        label.setAttribute('y', height - 13);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('class', 'chart-axis-label x-label');
        label.textContent = item.label || item.date;
        svg.appendChild(label);
      }
    });

    els.trendChart.replaceChildren(svg);
  }

  function svgLine(ns, x1, y1, x2, y2, className) {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('class', className);
    return line;
  }

  function svgPath(ns, d, className) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', className);
    return path;
  }

  function buildPath(series, x, y, key) {
    return series.map((item, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(item[key] || 0)}`).join(' ');
  }

  function appendPoint(svg, ns, cx, cy, className, titleText) {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', 4.5);
    circle.setAttribute('class', `chart-point ${className}`);
    const title = document.createElementNS(ns, 'title');
    title.textContent = titleText;
    circle.appendChild(title);
    svg.appendChild(circle);
  }

  function moveWeek(days) {
    const anchor = parseDate(els.manageDate.value || todayString());
    anchor.setDate(anchor.getDate() + days);
    els.manageDate.value = dateString(anchor);
    loadWeek();
  }

  async function loadWeek(clearMessage = true) {
    const anchorValue = els.manageDate.value;
    if (!anchorValue) {
      setMessage(els.saveMessage, '주간 기준일을 선택해주세요.', 'error');
      return;
    }

    const weekDates = getWeekDates(anchorValue);
    state.weekDates = weekDates;
    els.weekRange.textContent = formatWeekRange(weekDates);

    setWeekBusy(true, '불러오는 중');
    els.weekSettingsBody.innerHTML = '<div class="week-loading">주간 설정과 신청 현황을 불러오는 중입니다.</div>';

    try {
      const results = await Promise.all(
        weekDates.map((date) => api.post('admin.getDay', { password, date }))
      );

      state.days.clear();
      weekDates.forEach((date, index) => state.days.set(date, results[index]));

      if (!weekDates.includes(state.selectedDate)) {
        const today = todayString();
        state.selectedDate = weekDates.includes(today) ? today : weekDates[0];
      }

      renderWeek();
      renderSelectedDay();
      if (clearMessage) setMessage(els.saveMessage, '', 'muted');
    } catch (error) {
      handleAdminError(error, els.saveMessage);
      els.weekSettingsBody.innerHTML = '<div class="week-loading error">주간 설정을 불러오지 못했습니다.</div>';
    } finally {
      setWeekBusy(false, '불러오기');
    }
  }

  function renderWeek() {
    const fragment = document.createDocumentFragment();
    state.weekDates.forEach((date) => {
      const data = state.days.get(date);
      fragment.appendChild(createDayCard(date, data || { settings: defaultSettings(date), counts: emptyCounts() }));
    });
    els.weekSettingsBody.replaceChildren(fragment);
    updateSelectedCard();

    els.weekSettingsBody.querySelectorAll('textarea').forEach((textarea) => {
      textarea.addEventListener('input', () => autoGrow(textarea));
      autoGrow(textarea);
    });
  }

  function createDayCard(date, data) {
    const settings = data.settings || defaultSettings(date);
    const counts = data.counts || emptyCounts();
    const card = document.createElement('article');
    card.className = 'week-day-card';
    card.dataset.date = date;
    card.dataset.lastLunchPrice = String(settings.lunchPrice || 0);

    const header = document.createElement('div');
    header.className = 'day-card-header';
    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'day-card-title';
    selectButton.addEventListener('click', () => selectDay(date));
    selectButton.innerHTML = `<strong>${escapeHtml(formatDayTitle(date))}</strong><span>${escapeHtml(date)}</span><small>현황 보기</small>`;

    const enabledLabel = document.createElement('label');
    enabledLabel.className = 'toggle compact-toggle';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = settings.enabled ?? true;
    enabled.dataset.field = 'enabled';
    const enabledText = document.createElement('span');
    enabledText.textContent = '사용';
    enabledLabel.append(enabled, enabledText);
    header.append(selectButton, enabledLabel);

    const lunchSection = createMealSection('중식', 'lunch', settings.lunchMenu, settings.lunchDeadline || '10:30', settings.lunchPrice || 0);
    const dinnerSection = createMealSection('석식', 'dinner', settings.dinnerMenu, settings.dinnerDeadline || '16:30', settings.dinnerPrice || 0);

    const noticeLabel = document.createElement('label');
    noticeLabel.className = 'day-notice-field';
    const noticeTitle = document.createElement('span');
    noticeTitle.textContent = '안내문';
    const notice = document.createElement('textarea');
    notice.rows = 2;
    notice.placeholder = '해당 날짜 안내사항';
    notice.value = settings.notice || '';
    notice.dataset.field = 'notice';
    notice.className = 'auto-grow-textarea';
    noticeLabel.append(noticeTitle, notice);

    const summary = document.createElement('div');
    summary.className = 'day-cost-summary';
    summary.dataset.role = 'cost-summary';

    card.append(header, lunchSection, dinnerSection, noticeLabel, summary);

    const lunchPrice = card.querySelector('[data-field="lunchPrice"]');
    const dinnerPrice = card.querySelector('[data-field="dinnerPrice"]');
    lunchPrice.addEventListener('input', () => {
      const previous = card.dataset.lastLunchPrice || '0';
      const current = String(parseMoney(lunchPrice.value));
      if (!dinnerPrice.dataset.manuallyChanged || String(parseMoney(dinnerPrice.value)) === previous) {
        dinnerPrice.value = formatNumber(current);
        dinnerPrice.dataset.manuallyChanged = '';
      }
      card.dataset.lastLunchPrice = current;
      updateDayCostSummary(card, counts);
    });
    dinnerPrice.addEventListener('input', () => {
      dinnerPrice.dataset.manuallyChanged = String(parseMoney(dinnerPrice.value) !== parseMoney(lunchPrice.value));
      updateDayCostSummary(card, counts);
    });
    [lunchPrice, dinnerPrice].forEach((input) => {
      input.addEventListener('blur', () => { input.value = formatNumber(parseMoney(input.value)); });
      input.addEventListener('focus', () => { input.value = String(parseMoney(input.value) || ''); });
    });

    updateDayCostSummary(card, counts);
    return card;
  }

  function createMealSection(title, prefix, menuValue, deadlineValue, priceValue) {
    const section = document.createElement('section');
    section.className = `compact-meal-section ${prefix}`;

    const heading = document.createElement('div');
    heading.className = 'compact-meal-title';
    heading.innerHTML = `<strong>${title}</strong>`;

    const menu = document.createElement('textarea');
    menu.rows = 2;
    menu.className = 'compact-menu-input auto-grow-textarea';
    menu.placeholder = `${title} 메뉴`;
    menu.value = menuValue || '';
    menu.dataset.field = `${prefix}Menu`;

    const controls = document.createElement('div');
    controls.className = 'meal-mini-controls';
    const deadlineLabel = document.createElement('label');
    deadlineLabel.innerHTML = '<span>마감</span>';
    const deadline = document.createElement('input');
    deadline.type = 'time';
    deadline.step = '60';
    deadline.value = deadlineValue;
    deadline.dataset.field = `${prefix}Deadline`;
    deadlineLabel.appendChild(deadline);

    const priceLabel = document.createElement('label');
    priceLabel.innerHTML = '<span>1식 단가</span>';
    const price = document.createElement('input');
    price.type = 'text';
    price.inputMode = 'numeric';
    price.value = formatNumber(priceValue || 0);
    price.dataset.field = `${prefix}Price`;
    price.setAttribute('aria-label', `${title} 1식 단가`);
    priceLabel.appendChild(price);
    controls.append(deadlineLabel, priceLabel);

    section.append(heading, menu, controls);
    return section;
  }

  function updateDayCostSummary(card, counts) {
    const lunchPrice = parseMoney(card.querySelector('[data-field="lunchPrice"]')?.value);
    const dinnerPrice = parseMoney(card.querySelector('[data-field="dinnerPrice"]')?.value);
    const totalMeals = (counts.lunchApply || 0) + (counts.dinnerApply || 0);
    const totalCost = (counts.lunchApply || 0) * lunchPrice + (counts.dinnerApply || 0) * dinnerPrice;
    const summary = card.querySelector('[data-role="cost-summary"]');
    summary.innerHTML = `<span>중 ${formatNumber(counts.lunchApply || 0)} · 석 ${formatNumber(counts.dinnerApply || 0)}</span><strong>${formatNumber(totalMeals)}식 / ${formatNumber(totalCost)}원</strong>`;
  }

  function selectDay(date) {
    state.selectedDate = date;
    updateSelectedCard();
    renderSelectedDay();
  }

  function updateSelectedCard() {
    els.weekSettingsBody.querySelectorAll('.week-day-card').forEach((card) => {
      const selected = card.dataset.date === state.selectedDate;
      card.classList.toggle('selected', selected);
      card.querySelector('.day-card-title')?.setAttribute('aria-pressed', String(selected));
    });
  }

  function renderSelectedDay() {
    const date = state.selectedDate;
    const data = state.days.get(date);
    if (!date || !data) {
      renderResponses('', [], emptyCounts(), defaultSettings(''));
      return;
    }
    els.selectedDayTitle.textContent = formatDate(date);
    renderResponses(date, data.responses || [], data.counts || emptyCounts(), data.settings || defaultSettings(date));
  }

  async function refreshSelectedDay() {
    const date = state.selectedDate;
    if (!date) return;
    setButtonBusy(els.refreshButton, true, '불러오는 중');
    try {
      const data = await api.post('admin.getDay', { password, date });
      state.days.set(date, data);
      renderWeek();
      renderSelectedDay();
      setMessage(els.saveMessage, `${formatDate(date)} 현황을 새로고침했습니다.`, 'success');
      await loadDashboard();
    } catch (error) {
      handleAdminError(error, els.saveMessage);
    } finally {
      setButtonBusy(els.refreshButton, false, '현황 새로고침');
    }
  }

  async function saveWeek() {
    const cards = [...els.weekSettingsBody.querySelectorAll('.week-day-card')];
    if (cards.length !== WEEKDAY_COUNT) {
      setMessage(els.saveMessage, '주간 설정을 먼저 불러와주세요.', 'error');
      return;
    }

    const payloads = cards.map(readDayCard);
    const invalid = payloads.find((item) => !item.lunchDeadline || !item.dinnerDeadline);
    if (invalid) {
      setMessage(els.saveMessage, `${formatDate(invalid.date)}의 중식·석식 마감시간을 입력해주세요.`, 'error');
      return;
    }

    setWeekBusy(true, '저장 중');
    setMessage(els.saveMessage, '주간 설정을 저장하고 있습니다.', 'muted');
    try {
      for (let index = 0; index < payloads.length; index += 1) {
        setButtonBusy(els.saveWeekButton, true, `저장 중 ${index + 1}/${payloads.length}`);
        await api.post('admin.saveDay', { password, ...payloads[index] });
      }
      await loadWeek(false);
      await loadDashboard();
      setMessage(els.saveMessage, '월요일부터 금요일까지 설정을 모두 저장했습니다.', 'success');
    } catch (error) {
      handleAdminError(error, els.saveMessage);
    } finally {
      setWeekBusy(false, '불러오기');
      setButtonBusy(els.saveWeekButton, false, '이번 주 전체 저장');
    }
  }

  function readDayCard(card) {
    const field = (name) => card.querySelector(`[data-field="${name}"]`);
    return {
      date: card.dataset.date,
      enabled: field('enabled').checked,
      lunchMenu: field('lunchMenu').value.trim(),
      dinnerMenu: field('dinnerMenu').value.trim(),
      lunchDeadline: field('lunchDeadline').value,
      dinnerDeadline: field('dinnerDeadline').value,
      lunchPrice: parseMoney(field('lunchPrice').value),
      dinnerPrice: parseMoney(field('dinnerPrice').value),
      notice: field('notice').value.trim()
    };
  }

  function renderResponses(date, responses, counts, settings) {
    els.responseTitle.textContent = date ? `${formatDate(date)} 신청자 목록` : '신청자 목록';
    els.lunchApplyCount.textContent = formatNumber(counts.lunchApply || 0);
    els.lunchNoCount.textContent = formatNumber(counts.lunchNo || 0);
    els.dinnerApplyCount.textContent = formatNumber(counts.dinnerApply || 0);
    els.dinnerNoCount.textContent = formatNumber(counts.dinnerNo || 0);

    const totalMeals = (counts.lunchApply || 0) + (counts.dinnerApply || 0);
    const totalCost = (counts.lunchApply || 0) * (settings.lunchPrice || 0)
      + (counts.dinnerApply || 0) * (settings.dinnerPrice || 0);
    els.selectedTotalMeals.textContent = `${formatNumber(totalMeals)}식`;
    els.selectedTotalCost.textContent = `${formatNumber(totalCost)}원`;

    if (!responses.length) {
      els.responseBody.innerHTML = '<tr><td colspan="5" class="empty">아직 저장된 신청이 없습니다.</td></tr>';
      return;
    }

    els.responseBody.replaceChildren(...responses.map((item) => {
      const row = document.createElement('tr');
      [item.name, item.department, item.lunch || '-', item.dinner || '-', item.updatedAt].forEach((value, index) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if ((index === 2 || index === 3) && value === '신청') cell.className = 'status-apply';
        if ((index === 2 || index === 3) && value === '미신청') cell.className = 'status-no';
        row.appendChild(cell);
      });
      return row;
    }));
  }

  function defaultSettings(date) {
    return {
      date,
      enabled: true,
      lunchMenu: '',
      dinnerMenu: '',
      lunchDeadline: '10:30',
      dinnerDeadline: '16:30',
      lunchPrice: 0,
      dinnerPrice: 0,
      notice: ''
    };
  }

  function emptyCounts() {
    return { lunchApply: 0, lunchNo: 0, dinnerApply: 0, dinnerNo: 0 };
  }

  function handleAdminError(error, target) {
    if (/비밀번호|인증/.test(error.message)) logout();
    setMessage(target || els.saveMessage, error.message, 'error');
  }

  function getWeekDates(anchorValue) {
    const monday = startOfWeek(parseDate(anchorValue));
    return Array.from({ length: WEEKDAY_COUNT }, (_, index) => dateString(addDays(monday, index)));
  }

  function startOfWeek(date) {
    const result = new Date(date);
    const mondayOffset = (result.getDay() + 6) % 7;
    result.setDate(result.getDate() - mondayOffset);
    return result;
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function parseDate(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function dateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function todayString() {
    return dateString(new Date());
  }

  function formatDayTitle(value) {
    return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' })
      .format(parseDate(value));
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
      .format(parseDate(value));
  }

  function formatWeekRange(dates) {
    if (!dates.length) return '-';
    const first = parseDate(dates[0]);
    const last = parseDate(dates[dates.length - 1]);
    const firstLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(first);
    const lastLabel = new Intl.DateTimeFormat('ko-KR', {
      year: first.getFullYear() === last.getFullYear() ? undefined : 'numeric',
      month: first.getMonth() === last.getMonth() ? undefined : 'long',
      day: 'numeric'
    }).format(last);
    return `${firstLabel} – ${lastLabel}`;
  }

  function autoGrow(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.dataset.field === 'notice' ? 54 : 66)}px`;
  }

  function parseMoney(value) {
    const number = Number(String(value == null ? '' : value).replace(/[^0-9]/g, ''));
    return Number.isFinite(number) ? number : 0;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('ko-KR').format(Number(value) || 0);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
  }

  function setWeekBusy(busy, loadLabel) {
    setButtonBusy(els.loadButton, busy, busy ? loadLabel : '불러오기');
    els.previousWeekButton.disabled = busy;
    els.todayButton.disabled = busy;
    els.nextWeekButton.disabled = busy;
    els.manageDate.disabled = busy;
    els.saveWeekButton.disabled = busy;
  }

  function setDashboardBusy(busy) {
    els.dashboardPreviousButton.disabled = busy;
    els.dashboardTodayButton.disabled = busy;
    els.dashboardNextButton.disabled = busy;
    els.dashboardRefreshButton.disabled = busy;
    els.dashboardAnchor.disabled = busy;
    document.querySelectorAll('[data-dashboard-mode]').forEach((button) => { button.disabled = busy; });
    els.dashboardRefreshButton.textContent = busy ? '불러오는 중' : '새로고침';
  }

  function setButtonBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = label;
  }

  function setMessage(element, message, type) {
    element.textContent = message;
    element.dataset.type = type;
  }
})();
