(function () {
  'use strict';

  const config = window.MEAL_APP_CONFIG;
  const api = window.MealAPI;
  const state = {
    days: [],
    selectedDate: '',
    submissions: new Map(),
    identityReady: false,
    dirty: false,
    busy: false
  };

  const els = {
    companyName: document.getElementById('companyName'),
    appTitle: document.getElementById('appTitle'),
    currentTime: document.getElementById('currentTime'),
    identityForm: document.getElementById('identityForm'),
    employeeName: document.getElementById('employeeName'),
    department: document.getElementById('department'),
    identityButton: document.getElementById('identityButton'),
    identityState: document.getElementById('identityState'),
    dateTabs: document.getElementById('dateTabs'),
    loadingPanel: document.getElementById('loadingPanel'),
    dayArea: document.getElementById('dayArea'),
    relativeLabel: document.getElementById('relativeLabel'),
    selectedDateTitle: document.getElementById('selectedDateTitle'),
    selectedDateDescription: document.getElementById('selectedDateDescription'),
    submissionBadge: document.getElementById('submissionBadge'),
    dayAlert: document.getElementById('dayAlert'),
    mealForm: document.getElementById('mealForm'),
    lunchCard: document.getElementById('lunchCard'),
    dinnerCard: document.getElementById('dinnerCard'),
    lunchState: document.getElementById('lunchState'),
    dinnerState: document.getElementById('dinnerState'),
    lunchMenu: document.getElementById('lunchMenu'),
    dinnerMenu: document.getElementById('dinnerMenu'),
    lunchDeadline: document.getElementById('lunchDeadline'),
    dinnerDeadline: document.getElementById('dinnerDeadline'),
    lunchCalories: document.getElementById('lunchCalories'),
    dinnerCalories: document.getElementById('dinnerCalories'),
    lunchCalorieDetail: document.getElementById('lunchCalorieDetail'),
    dinnerCalorieDetail: document.getElementById('dinnerCalorieDetail'),
    lunchChoices: document.getElementById('lunchChoices'),
    dinnerChoices: document.getElementById('dinnerChoices'),
    noticePanel: document.getElementById('noticePanel'),
    noticeText: document.getElementById('noticeText'),
    saveSummary: document.getElementById('saveSummary'),
    formMessage: document.getElementById('formMessage'),
    submitButton: document.getElementById('submitButton'),
    toast: document.getElementById('toast')
  };

  document.title = config.APP_TITLE;
  els.companyName.textContent = config.COMPANY_NAME;
  els.appTitle.textContent = config.APP_TITLE;

  els.identityForm.addEventListener('submit', handleIdentitySubmit);
  els.mealForm.addEventListener('submit', handleMealSubmit);
  els.employeeName.addEventListener('input', markIdentityChanged);
  els.department.addEventListener('input', markIdentityChanged);
  document.querySelectorAll('input[name="lunch"], input[name="dinner"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.dirty = true;
      updateSaveDock();
    });
  });
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  restoreIdentity();
  updateClock();
  window.setInterval(updateClock, 30000);
  init();

  async function init() {
    setGlobalBusy(true);
    try {
      const data = await api.post('public.getWindow', {});
      state.days = Array.isArray(data.days) ? data.days : [];
      state.selectedDate = data.today || state.days[1]?.date || state.days[0]?.date || '';
      renderDateTabs();
      renderSelectedDay();

      if (hasIdentity()) {
        await loadSubmissions(false);
      }
    } catch (error) {
      showFatal(error.message);
    } finally {
      setGlobalBusy(false);
    }
  }

  function restoreIdentity() {
    els.employeeName.value = localStorage.getItem('mealEmployeeName') || '';
    els.department.value = localStorage.getItem('mealDepartment') || '';
    state.identityReady = hasIdentity();
    renderIdentityState();
  }

  function saveIdentity() {
    localStorage.setItem('mealEmployeeName', els.employeeName.value.trim());
    localStorage.setItem('mealDepartment', els.department.value.trim());
  }

  function hasIdentity() {
    return Boolean(els.employeeName.value.trim() && els.department.value.trim());
  }

  function markIdentityChanged() {
    state.identityReady = false;
    state.submissions.clear();
    renderIdentityState();
    if (state.days.length) renderSelectedDay();
    updateSaveDock();
  }

  async function handleIdentitySubmit(event) {
    event.preventDefault();
    if (!hasIdentity()) {
      showToast('이름과 부서를 모두 입력해주세요.');
      return;
    }

    setButtonBusy(els.identityButton, true, '확인 중');
    try {
      saveIdentity();
      await loadSubmissions(true);
      state.identityReady = true;
      renderIdentityState();
    } catch (error) {
      state.identityReady = false;
      renderIdentityState();
      showToast(error.message);
    } finally {
      setButtonBusy(els.identityButton, false, '내 신청 확인');
    }
  }

  async function loadSubmissions(showFeedback) {
    const data = await api.post('employee.getWindowSubmissions', {
      name: els.employeeName.value.trim(),
      department: els.department.value.trim()
    });

    state.submissions.clear();
    (data.submissions || []).forEach((submission) => {
      state.submissions.set(submission.date, submission);
    });
    state.identityReady = true;
    renderSelectedDay();
    if (showFeedback) showToast('신청 내역을 불러왔습니다.');
  }

  function renderIdentityState() {
    const ready = state.identityReady && hasIdentity();
    els.identityState.textContent = ready ? '신청자 확인됨' : '정보를 입력해주세요';
    els.identityState.classList.toggle('ready', ready);
  }

  function renderDateTabs() {
    const fragment = document.createDocumentFragment();
    state.days.forEach((day) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `date-tab${day.date === state.selectedDate ? ' active' : ''}`;
      button.role = 'tab';
      button.dataset.date = day.date;
      button.setAttribute('aria-selected', String(day.date === state.selectedDate));
      button.innerHTML = `<span>${escapeHtml(day.relativeLabel || '')}</span><strong>${escapeHtml(day.shortLabel || day.date)}</strong>`;
      button.addEventListener('click', () => selectDate(day.date));
      fragment.appendChild(button);
    });
    els.dateTabs.replaceChildren(fragment);
  }

  function selectDate(date) {
    if (state.dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 날짜를 이동할까요?')) return;
    state.selectedDate = date;
    state.dirty = false;
    renderDateTabs();
    renderSelectedDay();
  }

  function renderSelectedDay() {
    const day = state.days.find((item) => item.date === state.selectedDate);
    if (!day) return;

    els.loadingPanel.classList.add('hidden');
    els.dayArea.classList.remove('hidden');
    els.relativeLabel.textContent = day.relativeLabel || '';
    els.selectedDateTitle.textContent = day.dateLabel || day.date;
    els.selectedDateDescription.textContent = descriptionForDay(day);

    renderMeal('lunch', day.lunch, day);
    renderMeal('dinner', day.dinner, day);
    renderNotice(day);
    applySubmission(day);
    renderAlert(day);
    updateSaveDock();
  }

  function descriptionForDay(day) {
    if (day.relation === 'yesterday') return '지난 신청 내역을 확인할 수 있습니다.';
    if (!day.configured) return '아직 메뉴와 운영 설정이 등록되지 않았습니다.';
    if (!day.enabled) return '관리자가 해당 날짜의 식수 신청을 중지했습니다.';
    if (day.relation === 'tomorrow') return '내일 식사를 미리 신청하거나 수정할 수 있습니다.';
    return '마감 전까지 신청 내용을 자유롭게 수정할 수 있습니다.';
  }

  function renderMeal(type, meal, day) {
    const isLunch = type === 'lunch';
    const card = isLunch ? els.lunchCard : els.dinnerCard;
    const stateEl = isLunch ? els.lunchState : els.dinnerState;
    const menuEl = isLunch ? els.lunchMenu : els.dinnerMenu;
    const deadlineEl = isLunch ? els.lunchDeadline : els.dinnerDeadline;
    const calorieEl = isLunch ? els.lunchCalories : els.dinnerCalories;
    const detailEl = isLunch ? els.lunchCalorieDetail : els.dinnerCalorieDetail;
    const choices = isLunch ? els.lunchChoices : els.dinnerChoices;

    menuEl.textContent = meal?.menu || '메뉴 미등록';
    deadlineEl.textContent = meal?.deadline ? `신청 마감 ${meal.deadline}` : '마감시간 미등록';

    const editable = Boolean(day.editable && meal?.open);
    const status = day.relation === 'yesterday' ? '조회 전용' : meal?.open ? '신청 가능' : '마감';
    stateEl.textContent = status;
    stateEl.className = `status-badge ${meal?.open && day.editable ? 'open' : meal?.open ? 'neutral' : 'closed'}`;
    card.classList.toggle('is-disabled', !editable);

    choices.disabled = !editable;
    choices.querySelectorAll('input').forEach((input) => { input.disabled = !editable; });

    const calories = Number(meal?.calories || 0);
    calorieEl.classList.toggle('hidden', !calories);
    calorieEl.textContent = calories ? `예상 ${formatNumber(calories)} kcal` : '';
    renderCalorieDetails(detailEl, meal?.calorieDetails || []);
  }

  function renderCalorieDetails(element, details) {
    if (!Array.isArray(details) || !details.length) {
      element.classList.add('hidden');
      element.textContent = '';
      return;
    }
    element.classList.remove('hidden');
    element.textContent = details
      .filter((item) => Number(item.calories || 0) > 0)
      .map((item) => `${item.query || item.matchedName}: ${formatNumber(item.calories)} kcal`)
      .join(' · ');
  }

  function renderNotice(day) {
    const hasNotice = Boolean(day.notice);
    els.noticePanel.classList.toggle('hidden', !hasNotice);
    els.noticeText.textContent = day.notice || '';
  }

  function renderAlert(day) {
    let message = '';
    if (!day.configured) message = '해당 날짜는 아직 관리자 설정이 완료되지 않았습니다.';
    else if (!day.enabled) message = '해당 날짜는 식수 신청을 받지 않습니다.';
    else if (day.relation !== 'yesterday' && !day.lunch.open && !day.dinner.open) message = '중식과 석식 신청이 모두 마감되었습니다.';
    els.dayAlert.textContent = message;
    els.dayAlert.classList.toggle('hidden', !message);
  }

  function applySubmission(day) {
    clearChoices();
    const submission = state.submissions.get(day.date) || null;
    if (submission) {
      selectRadio('lunch', submission.lunch);
      selectRadio('dinner', submission.dinner);
      els.submissionBadge.textContent = '저장된 신청 내역';
      els.submissionBadge.className = 'status-badge saved';
    } else {
      els.submissionBadge.textContent = state.identityReady ? '신청 내역 없음' : '신청자 확인 필요';
      els.submissionBadge.className = 'status-badge neutral';
    }
    state.dirty = false;
  }

  function clearChoices() {
    document.querySelectorAll('input[name="lunch"], input[name="dinner"]').forEach((input) => { input.checked = false; });
  }

  function selectRadio(name, value) {
    if (!value) return;
    const target = document.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
    if (target) target.checked = true;
  }

  async function handleMealSubmit(event) {
    event.preventDefault();
    const day = state.days.find((item) => item.date === state.selectedDate);
    if (!day) return;

    if (!state.identityReady || !hasIdentity()) {
      setFormMessage('이름과 부서를 확인해주세요.', 'error');
      els.employeeName.focus();
      return;
    }
    if (!day.editable) {
      setFormMessage('지난 날짜는 수정할 수 없습니다.', 'error');
      return;
    }

    const lunch = selectedValue('lunch');
    const dinner = selectedValue('dinner');
    if (day.lunch.open && !lunch) {
      setFormMessage('중식 신청 여부를 선택해주세요.', 'error');
      return;
    }
    if (day.dinner.open && !dinner) {
      setFormMessage('석식 신청 여부를 선택해주세요.', 'error');
      return;
    }

    setButtonBusy(els.submitButton, true, '저장 중');
    try {
      const result = await api.post('employee.submit', {
        date: day.date,
        name: els.employeeName.value.trim(),
        department: els.department.value.trim(),
        lunch,
        dinner
      });
      state.submissions.set(day.date, result.submission);
      state.dirty = false;
      applySubmission(day);
      updateSaveDock();
      setFormMessage(result.message || '신청 내용이 저장되었습니다.', 'success');
      showToast(result.message || '신청 내용이 저장되었습니다.');
    } catch (error) {
      setFormMessage(error.message, 'error');
      showToast(error.message);
      await refreshWindow();
    } finally {
      setButtonBusy(els.submitButton, false, '신청 내용 저장');
    }
  }

  async function refreshWindow() {
    try {
      const data = await api.post('public.getWindow', {});
      state.days = data.days || [];
      renderDateTabs();
      renderSelectedDay();
    } catch (_) {
      // 현재 메시지를 유지합니다.
    }
  }

  function updateSaveDock() {
    const day = state.days.find((item) => item.date === state.selectedDate);
    if (!day) return;
    const editable = Boolean(day.editable && day.enabled && (day.lunch.open || day.dinner.open));
    const ready = state.identityReady && hasIdentity();
    els.submitButton.disabled = !editable || !ready || state.busy;

    if (!ready) {
      els.saveSummary.textContent = '신청자 정보를 먼저 확인해주세요.';
    } else if (!day.editable) {
      els.saveSummary.textContent = '지난 날짜는 신청 내역만 확인할 수 있습니다.';
    } else if (!editable) {
      els.saveSummary.textContent = '현재 수정 가능한 식사가 없습니다.';
    } else if (state.dirty) {
      els.saveSummary.textContent = '변경사항이 아직 저장되지 않았습니다.';
    } else {
      const lunch = selectedValue('lunch') || '미선택';
      const dinner = selectedValue('dinner') || '미선택';
      els.saveSummary.textContent = `중식 ${lunch} · 석식 ${dinner}`;
    }
  }

  function selectedValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
  }

  function setGlobalBusy(busy) {
    state.busy = busy;
    els.loadingPanel.classList.toggle('hidden', !busy);
    if (busy) els.dayArea.classList.add('hidden');
    updateSaveDock();
  }

  function setButtonBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = label;
  }

  function setFormMessage(message, type) {
    els.formMessage.textContent = message || '';
    els.formMessage.dataset.type = type || '';
  }

  function showFatal(message) {
    els.loadingPanel.classList.remove('hidden');
    els.loadingPanel.innerHTML = `<div><strong>정보를 불러오지 못했습니다.</strong><p>${escapeHtml(message)}</p></div>`;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  function updateClock() {
    const now = new Date();
    els.currentTime.textContent = new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(now);
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('ko-KR');
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
