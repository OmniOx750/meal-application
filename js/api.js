(function () {
  'use strict';

  const config = window.MEAL_APP_CONFIG;
  if (!config || !config.GAS_WEB_APP_URL) {
    throw new Error('MEAL_APP_CONFIG가 설정되지 않았습니다.');
  }

  const pending = new Map();

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.channel !== 'meal-application' || !message.requestId) return;

    const request = pending.get(message.requestId);
    if (!request) return;

    cleanup(message.requestId);

    if (message.ok) {
      request.resolve(message.data);
    } else {
      request.reject(new Error(message.error || '요청 처리 중 오류가 발생했습니다.'));
    }
  });

  function cleanup(requestId) {
    const request = pending.get(requestId);
    if (!request) return;

    clearTimeout(request.timer);
    request.form.remove();
    request.iframe.remove();
    pending.delete(requestId);
  }

  function createHiddenInput(name, value) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value == null ? '' : String(value);
    return input;
  }

  function post(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const requestId = `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
      const frameName = `meal-api-${requestId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

      const iframe = document.createElement('iframe');
      iframe.name = frameName;
      iframe.title = '데이터 통신';
      iframe.hidden = true;

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = config.GAS_WEB_APP_URL;
      form.target = frameName;
      form.hidden = true;
      form.append(
        createHiddenInput('action', action),
        createHiddenInput('requestId', requestId),
        createHiddenInput('origin', window.location.origin),
        createHiddenInput('payload', JSON.stringify(payload))
      );

      document.body.append(iframe, form);

      const timer = window.setTimeout(() => {
        cleanup(requestId);
        reject(new Error('서버 응답 시간이 초과되었습니다. Apps Script 배포 주소와 권한을 확인해주세요.'));
      }, config.API_TIMEOUT_MS || 15000);

      pending.set(requestId, { resolve, reject, iframe, form, timer });
      form.submit();
    });
  }

  window.MealAPI = Object.freeze({ post });
})();
