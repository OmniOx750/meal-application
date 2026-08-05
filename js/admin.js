(function () {
  'use strict';

  const api = window.MealAPI;
  let password = sessionStorage.getItem('mealAdminPassword') || '';

  const els = {
    loginCard: document.getElementById('loginCard'),
    loginForm: document.getElementById('loginForm'),
    adminPassword: document.getElementById('adminPassword'),
    loginButton: document.getElementById('loginButton'),
    loginMessage: document.getElementById('loginMessage'),
    adminArea: document.getElementById('adminArea'),
    manageDate: document.getElementById('manageDate'),
    todayButton: document.getElementById('todayButton'),
    loadButton: document.getElementById('loadButton'),
    logoutButton: document.getElementById('logoutButton'),
    enabled: document.getElementById('enabled'),
    lunchMenu: document.getElementById('lunchMenu'),
    dinnerMenu: document.getElementById('dinnerMenu'),
    lunchDeadline: document.getElementById('lunchDeadline'),
    dinnerDeadline: document.getElementById('dinnerDeadline'),
    notice: document.getElementById('notice'),
    saveButton: document.getElementById('saveButton'),
    saveMessage: document.getElementById('saveMessage'),
    refreshButton: document.getElementById('refreshButton'),
    responseTitle: document.getElementById('responseTitle'),
    responseBody: document.getElementById('responseBody'),
    lunchApplyCount: document.getElementById('lunchApplyCount'),
    lunchNoCount: document.getElementById('lunchNoCount'),
    dinnerApplyCount: document.getElementById('dinnerApplyCount'),
    dinnerNoCount: document.getElementById('dinnerNoCount')
  };

  els.loginForm.addEventListener('submit', login);
  els.todayButton.addEventListener('click', () => {
    els.manageDate.value = todayString();
    loadDay();
  });
  els.loadButton.addEventListener('click', loadDay);
  els.saveButton.addEventListener('click', saveDay);
  els.refreshButton.addEventListener('click', loadDay);
  els.logoutButton.addEventListener('click', logout);

  els.manageDate.value = todayString();

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
      await loadDay();
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
    sessionStorage.removeItem('mealAdminPassword');
    els.adminPassword.value = '';
    els.adminArea.classList.add('hidden');
    els.loginCard.classList.remove('hidden');
    setMessage(els.loginMessage, '로그아웃되었습니다.', 'muted');
  }

  async function loadDay() {
    const date = els.manageDate.value;
    if (!date) {
      setMessage(els.saveMessage, '관리 날짜를 선택해주세요.', 'error');
      return;
    }

    setButtonBusy(els.loadButton, true, '불러오는 중');
    setButtonBusy(els.refreshButton, true, '불러오는 중');

    try {
      const data = await api.post('admin.getDay', { password, date });
      renderSettings(data.settings);
      renderResponses(date, data.responses, data.counts);
      setMessage(els.saveMessage, '', 'muted');
    } catch (error) {
      handleAdminError(error);
    } finally {
      setButtonBusy(els.loadButton, false, '불러오기');
      setButtonBusy(els.refreshButton, false, '새로고침');
    }
  }

  async function saveDay() {
    const date = els.manageDate.value;
    if (!date) {
      setMessage(els.saveMessage, '관리 날짜를 선택해주세요.', 'error');
      return;
    }

    if (els.enabled.checked && (!els.lunchDeadline.value || !els.dinnerDeadline.value)) {
      setMessage(els.saveMessage, '중식과 석식 마감시간을 모두 입력해주세요.', 'error');
      return;
    }

    setButtonBusy(els.saveButton, true, '저장 중');
    try {
      const result = await api.post('admin.saveDay', {
        password,
        date,
        enabled: els.enabled.checked,
        lunchMenu: els.lunchMenu.value.trim(),
        dinnerMenu: els.dinnerMenu.value.trim(),
        lunchDeadline: els.lunchDeadline.value,
        dinnerDeadline: els.dinnerDeadline.value,
        notice: els.notice.value.trim()
      });
      renderSettings(result.settings);
      setMessage(els.saveMessage, '설정이 저장되었습니다.', 'success');
      await loadDay();
    } catch (error) {
      handleAdminError(error);
    } finally {
      setButtonBusy(els.saveButton, false, '설정 저장');
    }
  }

  function renderSettings(settings) {
    els.enabled.checked = settings?.enabled ?? true;
    els.lunchMenu.value = settings?.lunchMenu || '';
    els.dinnerMenu.value = settings?.dinnerMenu || '';
    els.lunchDeadline.value = settings?.lunchDeadline || '10:30';
    els.dinnerDeadline.value = settings?.dinnerDeadline || '16:30';
    els.notice.value = settings?.notice || '';
  }

  function renderResponses(date, responses, counts) {
    els.responseTitle.textContent = `${formatDate(date)} 신청자 목록`;
    els.lunchApplyCount.textContent = counts.lunchApply;
    els.lunchNoCount.textContent = counts.lunchNo;
    els.dinnerApplyCount.textContent = counts.dinnerApply;
    els.dinnerNoCount.textContent = counts.dinnerNo;

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

  function handleAdminError(error) {
    if (/비밀번호|인증/.test(error.message)) logout();
    setMessage(els.saveMessage, error.message, 'error');
  }

  function todayString() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
      .format(new Date(`${value}T00:00:00+09:00`));
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
