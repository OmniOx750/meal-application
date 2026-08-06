(function () {
  'use strict';

  const config = window.MEAL_PUSH_CONFIG;
  const api = window.MealAPI;
  const els = {
    install: document.getElementById('installAppButton'),
    toggle: document.getElementById('pushToggleButton'),
    state: document.getElementById('pushState'),
    help: document.getElementById('pushHelp'),
    name: document.getElementById('employeeName'),
    department: document.getElementById('department')
  };

  if (!config || !api || !els.install || !els.toggle) return;

  let deferredInstallPrompt = null;
  let serviceWorkerRegistration = null;
  let messaging = null;
  let busy = false;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    renderInstallState();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    renderInstallState();
    setHelp('홈 화면에 앱이 설치되었습니다.');
  });

  window.addEventListener('meal:identity-change', renderPushState);
  els.name?.addEventListener('input', renderPushState);
  els.department?.addEventListener('input', renderPushState);
  els.install.addEventListener('click', installApp);
  els.toggle.addEventListener('click', togglePush);

  init();

  async function init() {
    renderInstallState();
    renderPushState();

    if ('serviceWorker' in navigator) {
      try {
        serviceWorkerRegistration = await navigator.serviceWorker.register('./service-worker.js?v=3.7.4', { scope: './', updateViaCache: 'none' });
        await serviceWorkerRegistration.update();
      } catch (error) {
        console.error('서비스 워커 등록 실패', error);
        setHelp('앱 설치 기능을 준비하지 못했습니다. 페이지를 새로고침해주세요.');
      }
    }

    if (isPushEnabledLocally()) {
      setHelp('이 기기에서 마감 알림을 받고 있습니다.');
    }
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function hasIdentity() {
    return Boolean(els.name?.value.trim() && els.department?.value.trim());
  }

  function isPushEnabledLocally() {
    return Boolean(localStorage.getItem('mealPushToken')) && Notification.permission === 'granted';
  }

  function renderInstallState() {
    if (isStandalone()) {
      els.install.textContent = '앱 설치됨';
      els.install.disabled = true;
      return;
    }
    els.install.disabled = false;
    els.install.textContent = '앱 설치';
  }

  function renderPushState() {
    const enabled = isPushEnabledLocally();
    const ready = hasIdentity();
    els.state.textContent = enabled ? '알림 켜짐' : '알림 꺼짐';
    els.state.classList.toggle('ready', enabled);
    els.toggle.textContent = enabled ? '마감 알림 끄기' : '마감 알림 받기';
    els.toggle.disabled = busy || (!ready && !enabled);

    if (!ready && !enabled) {
      setHelp('신청자 정보를 확인한 뒤 알림을 켤 수 있습니다.');
    }
  }

  async function installApp() {
    if (isStandalone()) return;
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      renderInstallState();
      return;
    }

    if (isIos()) {
      window.alert('iPhone에서는 공유 버튼을 누른 뒤 “홈 화면에 추가”를 선택해주세요. 설치 후 홈 화면 아이콘으로 앱을 열어주세요.');
      return;
    }

    const isAndroid = /android/i.test(navigator.userAgent);
    const isChromium = /chrome|crios|edg|samsungbrowser/i.test(navigator.userAgent);
    if (isAndroid && isChromium) {
      window.alert('자동 설치 창이 아직 준비되지 않았습니다. 페이지를 한 번 새로고침한 뒤 브라우저 메뉴(⋮)에서 “앱 설치” 또는 “홈 화면에 추가”를 선택해주세요.');
      return;
    }
    if (isAndroid) {
      window.alert('현재 브라우저에서는 자동 설치가 지원되지 않을 수 있습니다. Chrome에서 이 주소를 연 뒤 메뉴(⋮)의 “앱 설치” 또는 “홈 화면에 추가”를 선택해주세요.');
      return;
    }

    window.alert('브라우저 주소창의 설치 아이콘 또는 메뉴에서 “앱 설치”를 선택해주세요.');
  }

  async function togglePush() {
    if (busy) return;
    if (isPushEnabledLocally()) {
      await disablePush();
    } else {
      await enablePush();
    }
  }

  async function ensureMessaging() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !window.firebase?.messaging) {
      throw new Error('이 브라우저에서는 푸시 알림을 사용할 수 없습니다.');
    }

    const supported = await window.firebase.messaging.isSupported();
    if (!supported) throw new Error('이 브라우저에서는 푸시 알림을 지원하지 않습니다.');

    if (!window.firebase.apps.length) window.firebase.initializeApp(config.firebaseConfig);
    if (!messaging) messaging = window.firebase.messaging();
    if (!serviceWorkerRegistration) {
      serviceWorkerRegistration = await navigator.serviceWorker.register('./service-worker.js?v=3.7.4', { scope: './', updateViaCache: 'none' });
      await serviceWorkerRegistration.update();
    }
    return messaging;
  }

  async function enablePush() {
    if (!hasIdentity()) {
      setHelp('이름과 부서를 먼저 입력하고 “내 신청 확인”을 눌러주세요.');
      els.name?.focus();
      return;
    }

    setBusy(true, '알림 연결 중');
    try {
      if (isIos() && !isStandalone()) {
        throw new Error('iPhone은 먼저 홈 화면에 앱을 추가한 뒤, 설치된 앱에서 알림을 켜주세요.');
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('휴대폰 설정에서 알림 권한을 허용해주세요.');

      const instance = await ensureMessaging();
      const token = await instance.getToken({
        vapidKey: config.vapidKey,
        serviceWorkerRegistration
      });
      if (!token) throw new Error('알림 기기 정보를 발급받지 못했습니다.');

      await api.post('employee.registerPush', {
        token,
        name: els.name.value.trim(),
        department: els.department.value.trim(),
        device: navigator.userAgent.slice(0, 300)
      });

      localStorage.setItem('mealPushToken', token);
      localStorage.setItem('mealPushName', els.name.value.trim());
      localStorage.setItem('mealPushDepartment', els.department.value.trim());

      instance.onMessage((payload) => {
        const title = payload?.data?.title || '식수 신청 알림';
        const body = payload?.data?.body || '';
        setHelp(`${title}${body ? ' · ' + body : ''}`);
      });

      setHelp('마감 1시간 전 알림이 설정되었습니다.');
    } catch (error) {
      setHelp(error.message || '알림을 설정하지 못했습니다.');
    } finally {
      setBusy(false);
      renderPushState();
    }
  }

  async function disablePush() {
    setBusy(true, '알림 해제 중');
    const token = localStorage.getItem('mealPushToken') || '';
    try {
      if (token) await api.post('employee.unregisterPush', { token });
      const instance = await ensureMessaging();
      if (token) await instance.deleteToken(token);
      localStorage.removeItem('mealPushToken');
      localStorage.removeItem('mealPushName');
      localStorage.removeItem('mealPushDepartment');
      setHelp('이 기기의 마감 알림을 해제했습니다.');
    } catch (error) {
      setHelp(error.message || '알림 해제 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
      renderPushState();
    }
  }

  function setBusy(value, label) {
    busy = value;
    els.toggle.disabled = value;
    if (value) els.toggle.textContent = label;
  }

  function setHelp(message) {
    els.help.textContent = message || '';
  }
})();
