(function () {
  'use strict';

  const config = window.MEAL_APP_CONFIG;
  const api = window.MealAPI;
  const state = { date: '', settings: null, submission: null };

  const els = {
    companyName: document.getElementById('companyName'),
    appTitle: document.getElementById('appTitle'),
    todayLabel: document.getElementById('todayLabel'),
    loadingCard: document.getElementById('loadingCard'),
    closedCard: document.getElementById('closedCard'),
    closedReason: document.getElementById('closedReason'),
    form: document.getElementById('mealForm'),
    employeeName: document.getElementById('employeeName'),
    department: document.getElementById('department'),
    loadPreviousButton: document.getElementById('loadPreviousButton'),
    lunchCard: document.getElementById('lunchCard'),
    dinnerCard: document.getElementById('dinnerCard'),
    lunchState: document.getElementById('lunchState'),
    dinnerState: document.getElementById('dinnerState'),
    lunchMenu: document.getElementById('lunchMenu'),
    dinnerMenu: document.getElementById('dinnerMenu'),
    lunchDeadline: document.getElementById('lunchDeadline'),
    dinnerDeadline: document.getElementById('dinnerDeadline'),
    lunchChoices: document.getElementById('lunchChoices'),
    dinnerChoices: document.getElementById('dinnerChoices'),
    noticeCard: document.getElementById('noticeCard'),
    submitButton: document.getElementById('submitButton'),
    formMessage: document.getElementById('formMessage')
  };

  document.title = config.APP_TITLE;
  els.companyName.textContent = config.COMPANY_NAME;
  els.appTitle.textContent = config.APP_TITLE;

  els.form.addEventListener('submit', submitApplication);
  els.loadPreviousButton.addEventListener('click', loadExistingSubmission);

  init();

  async function init() {
    restoreIdentity();
    setBusy(true);

    try {
      const data = await api.post('public.getToday', {});
      state.date = data.date;
      state.settings = data;
      renderSettings(data);

      if (els.employeeName.value.trim() && els.department.value.trim()) {
        await loadExistingSubmission(false);
      }
    } catch (error) {
      showClosed(error.message);
    } finally {
      setBusy(false);
    }
  }

  function renderSettings(data) {
    els.todayLabel.textContent = data.dateLabel;
    els.loadingCard.classList.add('hidden');

    if (!data.configured || !data.enabled) {
      showClosed(data.configured ? '관리자가 오늘 신청을 비활성화했습니다.' : '오늘의 메뉴와 마감시간이 아직 등록되지 않았습니다.');
      return;
    }

    els.closedCard.classList.add('hidden');
    els.form.classList.remove('hidden');

    renderMeal('lunch', data.lunch);
    renderMeal('dinner', data.dinner);

    if (data.notice) {
      els.noticeCard.textContent = data.notice;
      els.noticeCard.classList.remove('hidden');
    } else {
      els.noticeCard.classList.add('hidden');
    }

    if (!data.lunch.open && !data.dinner.open) {
      els.submitButton.disabled = true;
      setMessage('중식과 석식 신청이 모두 마감되었습니다.', 'muted');
    }
  }

  function renderMeal(type, meal) {
    const isLunch = type === 'lunch';
    const card = isLunch ? els.lunchCard : els.dinnerCard;
    const stateEl = isLunch ? els.lunchState : els.dinnerState;
    const menuEl = isLunch ? els.lunchMenu : els.dinnerMenu;
    const deadlineEl = isLunch ? els.lunchDeadline : els.dinnerDeadline;
    const choices = isLunch ? els.lunchChoices : els.dinnerChoices;

    menuEl.textContent = meal.menu || '메뉴 미등록';
    deadlineEl.textContent = meal.deadline ? `신청 마감 ${meal.deadline}` : '마감시간 미등록';
    stateEl.textContent = meal.open ? '신청 가능' : '마감';
    stateEl.classList.toggle('closed', !meal.open);
    card.classList.toggle('meal-closed', !meal.open);

    choices.disabled = !meal.open;
    choices.querySelectorAll('input').forEach((input) => {
      input.disabled = !meal.open;
    });
  }

  function showClosed(reason) {
    els.loadingCard.classList.add('hidden');
    els.form.classList.add('hidden');
    els.closedCard.classList.remove('hidden');
    els.closedReason.textContent = reason;
  }

  function restoreIdentity() {
    els.employeeName.value = localStorage.getItem('mealEmployeeName') || '';
    els.department.value = localStorage.getItem('mealDepartment') || '';
  }

  function saveIdentity() {
    localStorage.setItem('mealEmployeeName', els.employeeName.value.trim());
    localStorage.setItem('mealDepartment', els.department.value.trim());
  }

  async function loadExistingSubmission(showFeedback = true) {
    const name = els.employeeName.value.trim();
    const department = els.department.value.trim();

    if (!name || !department) {
      setMessage('이름과 부서를 먼저 입력해주세요.', 'error');
      return;
    }

    setButtonBusy(els.loadPreviousButton, true, '불러오는 중');
    try {
      const data = await api.post('employee.getSubmission', {
        date: state.date,
        name,
        department
      });

      state.submission = data.submission;
      if (data.submission) {
        selectRadio('lunch', data.submission.lunch);
        selectRadio('dinner', data.submission.dinner);
        if (showFeedback) setMessage('기존 신청 내용을 불러왔습니다.', 'success');
      } else if (showFeedback) {
        setMessage('저장된 신청 내용이 없습니다.', 'muted');
      }
    } catch (error) {
      setMessage(error.message, 'error');
    } finally {
      setButtonBusy(els.loadPreviousButton, false, '기존 신청 불러오기');
    }
  }

  function selectRadio(name, value) {
    if (!value) return;
    const input = document.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
    if (input) input.checked = true;
  }

  async function submitApplication(event) {
    event.preventDefault();

    const name = els.employeeName.value.trim();
    const department = els.department.value.trim();
    const lunch = getSelected('lunch');
    const dinner = getSelected('dinner');

    if (!name || !department) {
      setMessage('이름과 부서를 입력해주세요.', 'error');
      return;
    }

    if (state.settings.lunch.open && !lunch) {
      setMessage('중식 신청 여부를 선택해주세요.', 'error');
      return;
    }

    if (state.settings.dinner.open && !dinner) {
      setMessage('석식 신청 여부를 선택해주세요.', 'error');
      return;
    }

    setButtonBusy(els.submitButton, true, '저장 중');
    setMessage('', 'muted');

    try {
      const result = await api.post('employee.submit', {
        date: state.date,
        name,
        department,
        lunch,
        dinner
      });
      saveIdentity();
      state.submission = result.submission;
      setMessage(result.message || '신청 내용이 저장되었습니다.', 'success');
    } catch (error) {
      setMessage(error.message, 'error');
      await refreshSettings();
    } finally {
      setButtonBusy(els.submitButton, false, '신청 내용 저장');
    }
  }

  async function refreshSettings() {
    try {
      const data = await api.post('public.getToday', {});
      state.settings = data;
      renderSettings(data);
    } catch (_) {
      // 기존 오류 메시지를 유지합니다.
    }
  }

  function getSelected(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
  }

  function setBusy(isBusy) {
    if (isBusy) els.loadingCard.classList.remove('hidden');
  }

  function setButtonBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = label;
  }

  function setMessage(message, type) {
    els.formMessage.textContent = message;
    els.formMessage.dataset.type = type;
  }
})();
