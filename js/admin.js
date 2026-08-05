(function () {
  'use strict';

  const api = window.MealAPI;
  const state = {
    password: sessionStorage.getItem('mealAdminPassword') || '',
    dashboardMode: 'week',
    weekDates: [],
    days: new Map(),
    selectedDate: '',
    loading: false
  };

  const els = {
    loginView: document.getElementById('loginView'),
    loginForm: document.getElementById('loginForm'),
    adminPassword: document.getElementById('adminPassword'),
    loginButton: document.getElementById('loginButton'),
    loginMessage: document.getElementById('loginMessage'),
    adminArea: document.getElementById('adminArea'),
    logoutButton: document.getElementById('logoutButton'),
    refreshAllButton: document.getElementById('refreshAllButton'),
    dashboardMode: document.getElementById('dashboardMode'),
    dashboardAnchor: document.getElementById('dashboardAnchor'),
    dashboardPreviousButton: document.getElementById('dashboardPreviousButton'),
    dashboardNextButton: document.getElementById('dashboardNextButton'),
    dashboardTodayButton: document.getElementById('dashboardTodayButton'),
    dashboardPeriodLabel: document.getElementById('dashboardPeriodLabel'),
    dashboardTotalMeals: document.getElementById('dashboardTotalMeals'),
    dashboardLunchMeals: document.getElementById('dashboardLunchMeals'),
    dashboardDinnerMeals: document.getElementById('dashboardDinnerMeals'),
    dashboardTotalCost: document.getElementById('dashboardTotalCost'),
    dashboardAverage: document.getElementById('dashboardAverage'),
    trendChart: document.getElementById('trendChart'),
    dashboardMessage: document.getElementById('dashboardMessage'),
    manageDate: document.getElementById('manageDate'),
    previousWeekButton: document.getElementById('previousWeekButton'),
    nextWeekButton: document.getElementById('nextWeekButton'),
    currentWeekButton: document.getElementById('currentWeekButton'),
    nextWeekQuickButton: document.getElementById('nextWeekQuickButton'),
    weekRange: document.getElementById('weekRange'),
    weekSettingsBody: document.getElementById('weekSettingsBody'),
    saveWeekButton: document.getElementById('saveWeekButton'),
    saveMessage: document.getElementById('saveMessage'),
    selectedDayTitle: document.getElementById('selectedDayTitle'),
    selectedDayMenus: document.getElementById('selectedDayMenus'),
    selectedLunchCount: document.getElementById('selectedLunchCount'),
    selectedDinnerCount: document.getElementById('selectedDinnerCount'),
    selectedTotalMeals: document.getElementById('selectedTotalMeals'),
    selectedTotalCost: document.getElementById('selectedTotalCost'),
    openRosterButton: document.getElementById('openRosterButton'),
    rosterModal: document.getElementById('rosterModal'),
    closeRosterButton: document.getElementById('closeRosterButton'),
    rosterTitle: document.getElementById('rosterTitle'),
    rosterSubtitle: document.getElementById('rosterSubtitle'),
    rosterLunchSummary: document.getElementById('rosterLunchSummary'),
    rosterDinnerSummary: document.getElementById('rosterDinnerSummary'),
    responseBody: document.getElementById('responseBody'),
    toast: document.getElementById('toast')
  };

  els.loginForm.addEventListener('submit', handleLogin);
  els.logoutButton.addEventListener('click', logout);
  els.refreshAllButton.addEventListener('click', () => refreshAll(true));
  els.dashboardMode.addEventListener('click', handleDashboardMode);
  els.dashboardAnchor.addEventListener('change', loadDashboard);
  els.dashboardPreviousButton.addEventListener('click', () => moveDashboard(-1));
  els.dashboardNextButton.addEventListener('click', () => moveDashboard(1));
  els.dashboardTodayButton.addEventListener('click', () => {
    els.dashboardAnchor.value = todayString();
    loadDashboard();
  });
  els.manageDate.addEventListener('change', loadWeek);
  els.previousWeekButton.addEventListener('click', () => moveWeek(-7));
  els.nextWeekButton.addEventListener('click', () => moveWeek(7));
  els.currentWeekButton.addEventListener('click', () => {
    els.manageDate.value = todayString();
    loadWeek();
  });
  els.nextWeekQuickButton.addEventListener('click', () => {
    const nextWeek = parseDate(todayString());
    nextWeek.setDate(nextWeek.getDate() + 7);
    els.manageDate.value = dateString(nextWeek);
    loadWeek();
  });
  els.saveWeekButton.addEventListener('click', saveWeek);
  els.openRosterButton.addEventListener('click', openRoster);
  els.closeRosterButton.addEventListener('click', closeRoster);
  els.rosterModal.addEventListener('click', (event) => {
    if (event.target === els.rosterModal) closeRoster();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.rosterModal.classList.contains('hidden')) closeRoster();
  });

  const today = todayString();
  els.dashboardAnchor.value = today;
  els.manageDate.value = today;

  if (state.password) {
    verifyStoredPassword();
  }

  async function verifyStoredPassword() {
    try {
      await api.post('admin.verify', { password: state.password });
      openAdmin();
    } catch (_) {
      sessionStorage.removeItem('mealAdminPassword');
      state.password = '';
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const password = els.adminPassword.value;
    if (!password) {
      setMessage(els.loginMessage, '관리자 비밀번호를 입력해주세요.', 'error');
      return;
    }

    setButtonBusy(els.loginButton, true, '확인 중');
    try {
      await api.post('admin.verify', { password });
      state.password = password;
      sessionStorage.setItem('mealAdminPassword', password);
      openAdmin();
    } catch (error) {
      setMessage(els.loginMessage, error.message, 'error');
    } finally {
      setButtonBusy(els.loginButton, false, '관리자 화면 열기');
    }
  }

  function openAdmin() {
    els.loginView.classList.add('hidden');
    els.adminArea.classList.remove('hidden');
    refreshAll(false);
  }

  function logout() {
    state.password = '';
    sessionStorage.removeItem('mealAdminPassword');
    els.adminArea.classList.add('hidden');
    els.loginView.classList.remove('hidden');
    els.adminPassword.value = '';
    setMessage(els.loginMessage, '', '');
  }

  async function refreshAll(showFeedback) {
    setButtonBusy(els.refreshAllButton, true, '새로고침 중');
    try {
      await Promise.all([loadDashboard(), loadWeek()]);
      if (showFeedback) showToast('최신 데이터로 새로고침했습니다.');
    } finally {
      setButtonBusy(els.refreshAllButton, false, '전체 새로고침');
    }
  }

  function handleDashboardMode(event) {
    const button = event.target.closest('[data-mode]');
    if (!button) return;
    state.dashboardMode = button.dataset.mode;
    els.dashboardMode.querySelectorAll('[data-mode]').forEach((item) => {
      item.classList.toggle('active', item === button);
    });
    loadDashboard();
  }

  async function loadDashboard() {
    if (!state.password) return;
    setMessage(els.dashboardMessage, '불러오는 중입니다.', '');
    try {
      const data = await api.post('admin.getDashboard', {
        password: state.password,
        mode: state.dashboardMode,
        anchorDate: els.dashboardAnchor.value || todayString()
      });
      renderDashboard(data);
      setMessage(els.dashboardMessage, '', '');
    } catch (error) {
      handleAdminError(error, els.dashboardMessage);
    }
  }

  function renderDashboard(data) {
    const summary = data.summary || {};
    els.dashboardPeriodLabel.textContent = data.periodLabel || '-';
    els.dashboardTotalMeals.textContent = `${formatNumber(summary.totalMeals)}식`;
    els.dashboardLunchMeals.textContent = `${formatNumber(summary.lunchApply)}식`;
    els.dashboardDinnerMeals.textContent = `${formatNumber(summary.dinnerApply)}식`;
    els.dashboardTotalCost.textContent = `${formatNumber(summary.totalCost)}원`;
    els.dashboardAverage.textContent = `일평균 ${formatNumber(summary.dailyAverage || 0)}식`;
    renderTrendChart(data.series || []);
  }

  function renderTrendChart(series) {
    if (!series.length) {
      els.trendChart.innerHTML = '<p class="empty-state">표시할 데이터가 없습니다.</p>';
      return;
    }

    const width = 1100;
    const height = 280;
    const margin = { top: 20, right: 30, bottom: 48, left: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const maxValue = Math.max(1, ...series.flatMap((item) => [Number(item.lunch || 0), Number(item.dinner || 0)]));
    const tickMax = Math.max(5, Math.ceil(maxValue / 5) * 5);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'trend-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '중식 및 석식 신청 추이');

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

    svg.appendChild(svgPath(ns, buildPath(series, x, y, 'lunch'), 'chart-line lunch-line'));
    svg.appendChild(svgPath(ns, buildPath(series, x, y, 'dinner'), 'chart-line dinner-line'));

    const labelStep = series.length > 18 ? 4 : series.length > 10 ? 2 : 1;
    series.forEach((item, index) => {
      appendPoint(svg, ns, x(index), y(item.lunch || 0), 'lunch-point', `${item.date} 중식 ${item.lunch || 0}식`);
      appendPoint(svg, ns, x(index), y(item.dinner || 0), 'dinner-point', `${item.date} 석식 ${item.dinner || 0}식`);
      if (index % labelStep === 0 || index === series.length - 1) {
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', x(index));
        label.setAttribute('y', height - 16);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('class', 'chart-axis-label');
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
    circle.setAttribute('r', 5);
    circle.setAttribute('class', `chart-point ${className}`);
    const title = document.createElementNS(ns, 'title');
    title.textContent = titleText;
    circle.appendChild(title);
    svg.appendChild(circle);
  }

  function moveDashboard(direction) {
    const date = parseDate(els.dashboardAnchor.value || todayString());
    if (state.dashboardMode === 'day') date.setDate(date.getDate() + direction);
    if (state.dashboardMode === 'week') date.setDate(date.getDate() + (7 * direction));
    if (state.dashboardMode === 'month') date.setMonth(date.getMonth() + direction);
    els.dashboardAnchor.value = dateString(date);
    loadDashboard();
  }

  function moveWeek(days) {
    const date = parseDate(els.manageDate.value || todayString());
    date.setDate(date.getDate() + days);
    els.manageDate.value = dateString(date);
    loadWeek();
  }


  function updateWeekShortcutState() {
    const selectedMonday = weekMondayString(els.manageDate.value || todayString());
    const currentMonday = weekMondayString(todayString());
    const nextMondayDate = parseDate(currentMonday);
    nextMondayDate.setDate(nextMondayDate.getDate() + 7);
    const nextMonday = dateString(nextMondayDate);

    els.currentWeekButton.classList.toggle('active', selectedMonday === currentMonday);
    els.nextWeekQuickButton.classList.toggle('active', selectedMonday === nextMonday);
  }

  function weekMondayString(value) {
    const date = parseDate(value);
    const weekday = date.getDay();
    date.setDate(date.getDate() + (weekday === 0 ? -6 : 1 - weekday));
    return dateString(date);
  }

  async function loadWeek() {
    if (!state.password) return;
    els.weekSettingsBody.innerHTML = '<div class="surface loading-panel"><span class="spinner"></span><strong>주간 설정을 불러오는 중입니다.</strong></div>';
    setMessage(els.saveMessage, '', '');
    try {
      const data = await api.post('admin.getWeek', {
        password: state.password,
        anchorDate: els.manageDate.value || todayString()
      });
      state.weekDates = data.dates || [];
      state.days.clear();
      (data.days || []).forEach((day) => state.days.set(day.settings.date, day));
      if (!state.weekDates.includes(state.selectedDate)) {
        state.selectedDate = state.weekDates.includes(todayString()) ? todayString() : state.weekDates[0];
      }
      els.weekRange.textContent = data.periodLabel || '-';
      updateWeekShortcutState();
      renderWeek();
      renderSelectedDay();
    } catch (error) {
      handleAdminError(error, els.saveMessage);
      els.weekSettingsBody.innerHTML = '<div class="surface loading-panel"><strong>주간 설정을 불러오지 못했습니다.</strong></div>';
    }
  }

  function renderWeek() {
    const fragment = document.createDocumentFragment();
    state.weekDates.forEach((date) => {
      const data = state.days.get(date) || { settings: defaultSettings(date), counts: emptyCounts(), responses: [] };
      fragment.appendChild(createPlannerCard(date, data));
    });
    els.weekSettingsBody.replaceChildren(fragment);
  }

  function createPlannerCard(date, data) {
    const settings = data.settings || defaultSettings(date);
    const counts = data.counts || emptyCounts();
    const card = document.createElement('article');
    card.className = `planner-card${date === state.selectedDate ? ' selected' : ''}`;
    card.dataset.date = date;
    card.dataset.lastLunchPrice = String(settings.lunchPrice || 0);

    card.innerHTML = `
      <header class="planner-card-header">
        <button type="button" class="day-select">
          <strong>${escapeHtml(formatDayTitle(date))}</strong>
          <span>${escapeHtml(formatShortDate(date))}</span>
        </button>
        <label class="switch" title="해당 날짜 사용 여부">
          <input type="checkbox" data-field="enabled" ${settings.enabled !== false ? 'checked' : ''}>
          <span></span>
        </label>
      </header>
      <div class="planner-card-body">
        ${mealEditorHtml('중식', 'lunch', settings)}
        ${mealEditorHtml('석식', 'dinner', settings)}
        <label class="notice-editor">안내문
          <textarea data-field="notice" rows="2" placeholder="직원 화면 안내사항">${escapeHtml(settings.notice || '')}</textarea>
        </label>
        <div class="day-summary-strip">
          <div><span>총 식수</span><strong>${formatNumber((counts.lunchApply || 0) + (counts.dinnerApply || 0))}식</strong></div>
          <div><span>예상 비용</span><strong data-role="cost-summary">${formatNumber(dayCost(settings, counts))}원</strong></div>
        </div>
      </div>`;

    card.querySelector('.day-select').addEventListener('click', () => selectDay(date));
    card.querySelectorAll('textarea').forEach((textarea) => {
      textarea.addEventListener('input', () => autoGrow(textarea));
      autoGrow(textarea);
    });

    const lunchPrice = card.querySelector('[data-field="lunchPrice"]');
    const dinnerPrice = card.querySelector('[data-field="dinnerPrice"]');
    const updateCost = () => updateCardCost(card, counts);

    lunchPrice.addEventListener('input', () => {
      const previous = Number(card.dataset.lastLunchPrice || 0);
      const current = parseMoney(lunchPrice.value);
      if (!dinnerPrice.dataset.manual || parseMoney(dinnerPrice.value) === previous) {
        dinnerPrice.value = formatNumber(current);
        dinnerPrice.dataset.manual = '';
      }
      card.dataset.lastLunchPrice = String(current);
      updateCost();
    });
    dinnerPrice.addEventListener('input', () => {
      dinnerPrice.dataset.manual = parseMoney(dinnerPrice.value) === parseMoney(lunchPrice.value) ? '' : 'true';
      updateCost();
    });
    [lunchPrice, dinnerPrice].forEach((input) => {
      input.addEventListener('focus', () => { input.value = String(parseMoney(input.value) || ''); });
      input.addEventListener('blur', () => { input.value = formatNumber(parseMoney(input.value)); });
    });

    card.querySelectorAll('.auto-calorie-button').forEach((button) => {
      button.addEventListener('click', () => estimateCalories(card, button.dataset.meal));
    });
    return card;
  }

  function mealEditorHtml(title, prefix, settings) {
    const menu = settings[`${prefix}Menu`] || '';
    const deadline = settings[`${prefix}Deadline`] || (prefix === 'lunch' ? '10:30' : '16:30');
    const price = settings[`${prefix}Price`] || 0;
    const calories = settings[`${prefix}Calories`] || 0;
    const details = settings[`${prefix}CalorieDetails`] || [];
    return `
      <section class="meal-editor ${prefix}">
        <div class="meal-editor-head">
          <strong>${title}</strong>
          <button type="button" class="auto-calorie-button" data-meal="${prefix}">열량 자동 추정</button>
        </div>
        <textarea data-field="${prefix}Menu" rows="3" placeholder="${title} 메뉴를 / 또는 줄바꿈으로 구분">${escapeHtml(menu)}</textarea>
        <div class="mini-field-grid">
          <label class="mini-field">마감
            <input type="time" data-field="${prefix}Deadline" value="${escapeHtml(deadline)}">
          </label>
          <label class="mini-field">단가
            <input inputmode="numeric" data-field="${prefix}Price" value="${formatNumber(price)}">
          </label>
          <label class="mini-field">예상 kcal
            <input inputmode="numeric" data-field="${prefix}Calories" value="${formatNumber(calories)}">
          </label>
          <label class="mini-field">기준
            <input value="표준 1인분" readonly tabindex="-1">
          </label>
        </div>
        <p class="calorie-result" data-role="${prefix}CalorieResult" data-details="${escapeHtml(JSON.stringify(details))}">${escapeHtml(calorieSummary(details, calories))}</p>
      </section>`;
  }

  async function estimateCalories(card, meal) {
    const menuInput = card.querySelector(`[data-field="${meal}Menu"]`);
    const calorieInput = card.querySelector(`[data-field="${meal}Calories"]`);
    const resultEl = card.querySelector(`[data-role="${meal}CalorieResult"]`);
    const button = card.querySelector(`.auto-calorie-button[data-meal="${meal}"]`);
    const menu = menuInput.value.trim();
    if (!menu) {
      showToast('메뉴를 먼저 입력해주세요.');
      menuInput.focus();
      return;
    }

    setButtonBusy(button, true, '계산 중');
    try {
      const result = await api.post('admin.estimateCalories', {
        password: state.password,
        menu
      });
      calorieInput.value = formatNumber(result.totalCalories || 0);
      resultEl.dataset.details = JSON.stringify(result.details || []);
      resultEl.textContent = result.summary || calorieSummary(result.details || [], result.totalCalories || 0);
      showToast(result.usedApi ? '식약처 DB 기준으로 열량을 추정했습니다.' : '내장 기준표로 열량을 추정했습니다.');
    } catch (error) {
      handleAdminError(error, els.saveMessage);
    } finally {
      setButtonBusy(button, false, '열량 자동 추정');
    }
  }

  function selectDay(date) {
    state.selectedDate = date;
    els.weekSettingsBody.querySelectorAll('.planner-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.date === date);
    });
    renderSelectedDay();
  }

  function renderSelectedDay() {
    const data = state.days.get(state.selectedDate);
    if (!data) return;
    const settings = data.settings || defaultSettings(state.selectedDate);
    const counts = data.counts || emptyCounts();
    els.selectedDayTitle.textContent = `${formatDayTitle(state.selectedDate)} · ${formatLongDate(state.selectedDate)}`;
    els.selectedDayMenus.textContent = `중식 ${settings.lunchMenu || '미등록'} · 석식 ${settings.dinnerMenu || '미등록'}`;
    els.selectedLunchCount.textContent = `${formatNumber(counts.lunchApply)}식`;
    els.selectedDinnerCount.textContent = `${formatNumber(counts.dinnerApply)}식`;
    els.selectedTotalMeals.textContent = `${formatNumber((counts.lunchApply || 0) + (counts.dinnerApply || 0))}식`;
    els.selectedTotalCost.textContent = `${formatNumber(dayCost(settings, counts))}원`;
  }

  async function saveWeek() {
    const cards = Array.from(els.weekSettingsBody.querySelectorAll('.planner-card'));
    if (!cards.length) return;
    const days = cards.map(collectCardSettings);
    setButtonBusy(els.saveWeekButton, true, '저장 중');
    setMessage(els.saveMessage, '주간 설정을 저장하고 있습니다.', '');
    try {
      const result = await api.post('admin.saveWeek', {
        password: state.password,
        days
      });
      state.days.clear();
      (result.days || []).forEach((day) => state.days.set(day.settings.date, day));
      renderWeek();
      renderSelectedDay();
      setMessage(els.saveMessage, '선택한 주 설정이 저장되었습니다.', 'success');
      showToast('선택한 주 설정이 저장되었습니다.');
      loadDashboard();
    } catch (error) {
      handleAdminError(error, els.saveMessage);
    } finally {
      setButtonBusy(els.saveWeekButton, false, '선택 주 전체 저장');
    }
  }

  function collectCardSettings(card) {
    const value = (field) => card.querySelector(`[data-field="${field}"]`);
    const lunchResult = card.querySelector('[data-role="lunchCalorieResult"]');
    const dinnerResult = card.querySelector('[data-role="dinnerCalorieResult"]');
    return {
      date: card.dataset.date,
      enabled: value('enabled').checked,
      lunchMenu: value('lunchMenu').value,
      dinnerMenu: value('dinnerMenu').value,
      lunchDeadline: value('lunchDeadline').value,
      dinnerDeadline: value('dinnerDeadline').value,
      lunchPrice: parseMoney(value('lunchPrice').value),
      dinnerPrice: parseMoney(value('dinnerPrice').value),
      lunchCalories: parseMoney(value('lunchCalories').value),
      dinnerCalories: parseMoney(value('dinnerCalories').value),
      lunchCalorieDetails: safeParseArray(lunchResult.dataset.details),
      dinnerCalorieDetails: safeParseArray(dinnerResult.dataset.details),
      notice: value('notice').value
    };
  }

  function updateCardCost(card, counts) {
    const lunchPrice = parseMoney(card.querySelector('[data-field="lunchPrice"]').value);
    const dinnerPrice = parseMoney(card.querySelector('[data-field="dinnerPrice"]').value);
    const total = (counts.lunchApply || 0) * lunchPrice + (counts.dinnerApply || 0) * dinnerPrice;
    card.querySelector('[data-role="cost-summary"]').textContent = `${formatNumber(total)}원`;
  }

  function openRoster() {
    const data = state.days.get(state.selectedDate);
    if (!data) return;
    const responses = data.responses || [];
    const counts = data.counts || emptyCounts();
    els.rosterTitle.textContent = `${formatLongDate(state.selectedDate)} 신청자 명단`;
    els.rosterSubtitle.textContent = `${responses.length}명의 신청 기록`;
    els.rosterLunchSummary.textContent = `중식 ${formatNumber(counts.lunchApply)}식`;
    els.rosterDinnerSummary.textContent = `석식 ${formatNumber(counts.dinnerApply)}식`;
    renderRosterTable(responses);
    els.rosterModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeRoster() {
    els.rosterModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function renderRosterTable(responses) {
    if (!responses.length) {
      els.responseBody.innerHTML = '<tr><td colspan="5" class="empty-cell">신청 내역이 없습니다.</td></tr>';
      return;
    }
    els.responseBody.innerHTML = responses.map((item) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.department)}</td>
        <td>${statusPill(item.lunch)}</td>
        <td>${statusPill(item.dinner)}</td>
        <td>${escapeHtml(item.updatedAt || '-')}</td>
      </tr>`).join('');
  }

  function statusPill(value) {
    const apply = value === '신청';
    return `<span class="table-status ${apply ? 'apply' : 'no'}">${escapeHtml(value || '미선택')}</span>`;
  }

  function handleAdminError(error, messageElement) {
    const message = error?.message || '요청 처리 중 오류가 발생했습니다.';
    setMessage(messageElement, message, 'error');
    if (message.includes('관리자 비밀번호')) logout();
  }

  function mealPrice(settings, meal) {
    return Number(settings?.[`${meal}Price`] || 0);
  }

  function dayCost(settings, counts) {
    return (counts.lunchApply || 0) * mealPrice(settings, 'lunch') +
      (counts.dinnerApply || 0) * mealPrice(settings, 'dinner');
  }

  function defaultSettings(date) {
    return {
      date,
      lunchMenu: '', dinnerMenu: '',
      lunchDeadline: '10:30', dinnerDeadline: '16:30',
      lunchPrice: 0, dinnerPrice: 0,
      lunchCalories: 0, dinnerCalories: 0,
      lunchCalorieDetails: [], dinnerCalorieDetails: [],
      notice: '', enabled: true
    };
  }

  function emptyCounts() {
    return { lunchApply: 0, lunchNo: 0, dinnerApply: 0, dinnerNo: 0 };
  }

  function calorieSummary(details, total) {
    const matched = (details || []).filter((item) => Number(item.calories || 0) > 0);
    if (!matched.length && !Number(total || 0)) return '메뉴 입력 후 자동 추정을 눌러주세요.';
    const unknown = (details || []).filter((item) => !Number(item.calories || 0)).length;
    const names = matched.slice(0, 3).map((item) => `${item.query} ${formatNumber(item.calories)}kcal`).join(' · ');
    return `${names}${matched.length > 3 ? ` 외 ${matched.length - 3}개` : ''}${unknown ? ` · 미확인 ${unknown}개` : ''}`;
  }

  function autoGrow(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.classList.contains('notice-editor') ? 52 : 70)}px`;
  }

  function setButtonBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = label;
  }

  function setMessage(element, message, type) {
    element.textContent = message || '';
    element.dataset.type = type || '';
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2500);
  }

  function parseMoney(value) {
    const number = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('ko-KR');
  }

  function todayString() {
    const now = new Date();
    return dateString(now);
  }

  function dateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDate(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  function formatDayTitle(date) {
    return new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(parseDate(date));
  }

  function formatShortDate(date) {
    return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(parseDate(date));
  }

  function formatLongDate(date) {
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(parseDate(date));
  }

  function safeParseArray(value) {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
