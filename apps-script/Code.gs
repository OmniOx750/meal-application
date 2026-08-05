/**
 * GitHub Pages 식수 신청 시스템 - Google Apps Script 백엔드
 *
 * 1) 아래 SETUP 값을 수정합니다.
 * 2) setupProject()를 한 번 실행합니다.
 * 3) 웹 앱으로 배포합니다. (실행 사용자: 나 / 액세스: 모든 사용자)
 */

const SETUP = Object.freeze({
  ADMIN_PASSWORD: 'change-this-password',
  ALLOWED_ORIGINS: ['https://YOUR_GITHUB_ID.github.io'],
  TIMEZONE: 'Asia/Seoul'
});

const APP = Object.freeze({
  SETTINGS_SHEET: '식수설정',
  RESPONSES_SHEET: '식수신청',
  SETTINGS_HEADERS: ['날짜', '중식메뉴', '석식메뉴', '중식마감', '석식마감', '안내문', '사용여부', '수정일시'],
  RESPONSES_HEADERS: ['날짜', '이름', '부서', '중식', '석식', '수정일시'],
  STATUS_VALUES: ['신청', '미신청']
});

function setupProject() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Google 시트에서 확장 프로그램 > Apps Script로 실행해주세요.');

  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    SPREADSHEET_ID: spreadsheet.getId(),
    ADMIN_PASSWORD_HASH: hashText_(SETUP.ADMIN_PASSWORD),
    ALLOWED_ORIGINS: JSON.stringify(SETUP.ALLOWED_ORIGINS),
    TIMEZONE: SETUP.TIMEZONE
  }, true);

  ensureSheet_(spreadsheet, APP.SETTINGS_SHEET, APP.SETTINGS_HEADERS);
  ensureSheet_(spreadsheet, APP.RESPONSES_SHEET, APP.RESPONSES_HEADERS);

  const today = formatDate_(new Date(), 'yyyy-MM-dd');
  if (!findSettingsRow_(today)) {
    upsertSettings_({
      date: today,
      lunchMenu: '',
      dinnerMenu: '',
      lunchDeadline: '10:30',
      dinnerDeadline: '16:30',
      notice: '',
      enabled: true
    });
  }

  spreadsheet.getSheetByName(APP.SETTINGS_SHEET).autoResizeColumns(1, APP.SETTINGS_HEADERS.length);
  spreadsheet.getSheetByName(APP.RESPONSES_SHEET).autoResizeColumns(1, APP.RESPONSES_HEADERS.length);
}

function doGet() {
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><title>Meal API</title>' +
    '<body style="font-family:sans-serif;padding:30px"><h2>식수 신청 API가 실행 중입니다.</h2>' +
    '<p>직원 화면은 GitHub Pages 주소를 이용해주세요.</p></body>'
  );
}

function doPost(e) {
  const requestId = String(e?.parameter?.requestId || '');
  const requestedOrigin = String(e?.parameter?.origin || '');
  let response;

  try {
    const action = String(e?.parameter?.action || '');
    const payload = parsePayload_(e?.parameter?.payload);
    response = route_(action, payload);
    return bridgeResponse_(requestId, true, response, '', requestedOrigin);
  } catch (error) {
    console.error(error);
    return bridgeResponse_(requestId, false, null, error.message || '서버 오류가 발생했습니다.', requestedOrigin);
  }
}

function route_(action, payload) {
  switch (action) {
    case 'public.getToday':
      return getPublicToday_();
    case 'employee.getSubmission':
      return getEmployeeSubmission_(payload);
    case 'employee.submit':
      return submitEmployeeApplication_(payload);
    case 'admin.verify':
      verifyAdmin_(payload.password);
      return { verified: true };
    case 'admin.getDay':
      verifyAdmin_(payload.password);
      return getAdminDay_(payload.date);
    case 'admin.saveDay':
      verifyAdmin_(payload.password);
      return saveAdminDay_(payload);
    default:
      throw new Error('지원하지 않는 요청입니다.');
  }
}

function getPublicToday_() {
  const now = new Date();
  const date = formatDate_(now, 'yyyy-MM-dd');
  const settings = findSettingsRow_(date);

  if (!settings) {
    return {
      date: date,
      dateLabel: formatKoreanDateLabel_(now),
      configured: false,
      enabled: false,
      notice: '',
      lunch: emptyMeal_(),
      dinner: emptyMeal_()
    };
  }

  return {
    date: date,
    dateLabel: formatKoreanDateLabel_(now),
    configured: true,
    enabled: settings.enabled,
    notice: settings.notice,
    serverTime: formatDate_(now, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    lunch: buildMealState_(date, settings.lunchMenu, settings.lunchDeadline, settings.enabled, now),
    dinner: buildMealState_(date, settings.dinnerMenu, settings.dinnerDeadline, settings.enabled, now)
  };
}

function getEmployeeSubmission_(payload) {
  const date = validateDate_(payload.date);
  const name = cleanText_(payload.name, 30, '이름');
  const department = cleanText_(payload.department, 40, '부서');
  const row = findResponseRow_(date, name, department);

  return { submission: row ? responseRowToObject_(row.values) : null };
}

function submitEmployeeApplication_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const date = validateDate_(payload.date);
    const today = formatDate_(new Date(), 'yyyy-MM-dd');
    if (date !== today) throw new Error('오늘 날짜의 식수만 신청할 수 있습니다.');

    const name = cleanText_(payload.name, 30, '이름');
    const department = cleanText_(payload.department, 40, '부서');
    const settings = findSettingsRow_(date);
    if (!settings || !settings.enabled) throw new Error('오늘 식수 신청이 열려 있지 않습니다.');

    const now = new Date();
    const lunchOpen = isMealOpen_(date, settings.lunchDeadline, settings.enabled, now);
    const dinnerOpen = isMealOpen_(date, settings.dinnerDeadline, settings.enabled, now);
    if (!lunchOpen && !dinnerOpen) throw new Error('중식과 석식 신청이 모두 마감되었습니다.');

    const existing = findResponseRow_(date, name, department);
    const existingObject = existing ? responseRowToObject_(existing.values) : null;

    let lunch = existingObject?.lunch || '';
    let dinner = existingObject?.dinner || '';

    if (lunchOpen) lunch = validateStatus_(payload.lunch, '중식');
    if (dinnerOpen) dinner = validateStatus_(payload.dinner, '석식');

    const values = [date, name, department, lunch, dinner, now];
    const sheet = getSpreadsheet_().getSheetByName(APP.RESPONSES_SHEET);

    if (existing) {
      sheet.getRange(existing.rowNumber, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }

    return {
      message: existing ? '신청 내용이 수정되었습니다.' : '신청 내용이 저장되었습니다.',
      submission: responseRowToObject_(values)
    };
  } finally {
    lock.releaseLock();
  }
}

function getAdminDay_(dateValue) {
  const date = validateDate_(dateValue);
  const settings = findSettingsRow_(date) || {
    date: date,
    lunchMenu: '',
    dinnerMenu: '',
    lunchDeadline: '10:30',
    dinnerDeadline: '16:30',
    notice: '',
    enabled: true
  };

  const responses = getResponsesForDate_(date);
  return {
    settings: settings,
    responses: responses,
    counts: countResponses_(responses)
  };
}

function saveAdminDay_(payload) {
  const settings = {
    date: validateDate_(payload.date),
    lunchMenu: cleanOptionalText_(payload.lunchMenu, 500),
    dinnerMenu: cleanOptionalText_(payload.dinnerMenu, 500),
    lunchDeadline: validateTime_(payload.lunchDeadline, '중식 마감시간'),
    dinnerDeadline: validateTime_(payload.dinnerDeadline, '석식 마감시간'),
    notice: cleanOptionalText_(payload.notice, 500),
    enabled: toBoolean_(payload.enabled)
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    upsertSettings_(settings);
  } finally {
    lock.releaseLock();
  }

  return { settings: findSettingsRow_(settings.date) };
}

function upsertSettings_(settings) {
  const sheet = getSpreadsheet_().getSheetByName(APP.SETTINGS_SHEET);
  const existing = findSettingsRow_(settings.date);
  const values = [
    settings.date,
    settings.lunchMenu,
    settings.dinnerMenu,
    settings.lunchDeadline,
    settings.dinnerDeadline,
    settings.notice,
    settings.enabled,
    new Date()
  ];

  if (existing) {
    sheet.getRange(existing.rowNumber, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
}

function findSettingsRow_(date) {
  const sheet = getSpreadsheet_().getSheetByName(APP.SETTINGS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, APP.SETTINGS_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    if (normalizeSheetDate_(values[i][0]) === date) {
      return {
        rowNumber: i + 2,
        date: date,
        lunchMenu: String(values[i][1] || ''),
        dinnerMenu: String(values[i][2] || ''),
        lunchDeadline: normalizeTime_(values[i][3]),
        dinnerDeadline: normalizeTime_(values[i][4]),
        notice: String(values[i][5] || ''),
        enabled: toBoolean_(values[i][6]),
        updatedAt: values[i][7] ? formatDate_(new Date(values[i][7]), 'yyyy-MM-dd HH:mm:ss') : ''
      };
    }
  }
  return null;
}

function findResponseRow_(date, name, department) {
  const sheet = getSpreadsheet_().getSheetByName(APP.RESPONSES_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, APP.RESPONSES_HEADERS.length).getValues();
  const normalizedName = normalizeKey_(name);
  const normalizedDepartment = normalizeKey_(department);

  for (let i = 0; i < values.length; i++) {
    if (
      normalizeSheetDate_(values[i][0]) === date &&
      normalizeKey_(values[i][1]) === normalizedName &&
      normalizeKey_(values[i][2]) === normalizedDepartment
    ) {
      return { rowNumber: i + 2, values: values[i] };
    }
  }
  return null;
}

function getResponsesForDate_(date) {
  const sheet = getSpreadsheet_().getSheetByName(APP.RESPONSES_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, APP.RESPONSES_HEADERS.length)
    .getValues()
    .filter(row => normalizeSheetDate_(row[0]) === date)
    .map(responseRowToObject_)
    .sort((a, b) => a.department.localeCompare(b.department, 'ko') || a.name.localeCompare(b.name, 'ko'));
}

function responseRowToObject_(row) {
  return {
    date: normalizeSheetDate_(row[0]),
    name: String(row[1] || ''),
    department: String(row[2] || ''),
    lunch: String(row[3] || ''),
    dinner: String(row[4] || ''),
    updatedAt: row[5] ? formatDate_(new Date(row[5]), 'yyyy-MM-dd HH:mm:ss') : ''
  };
}

function countResponses_(responses) {
  return responses.reduce((counts, item) => {
    if (item.lunch === '신청') counts.lunchApply++;
    if (item.lunch === '미신청') counts.lunchNo++;
    if (item.dinner === '신청') counts.dinnerApply++;
    if (item.dinner === '미신청') counts.dinnerNo++;
    return counts;
  }, { lunchApply: 0, lunchNo: 0, dinnerApply: 0, dinnerNo: 0 });
}

function buildMealState_(date, menu, deadline, enabled, now) {
  return {
    menu: menu || '',
    deadline: deadline || '',
    open: isMealOpen_(date, deadline, enabled, now)
  };
}

function emptyMeal_() {
  return { menu: '', deadline: '', open: false };
}

function isMealOpen_(date, deadline, enabled, now) {
  if (!enabled || !/^\d{2}:\d{2}$/.test(deadline || '')) return false;
  const deadlineDate = new Date(`${date}T${deadline}:00+09:00`);
  return now.getTime() < deadlineDate.getTime();
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#EAF2FF');
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('초기 설정이 필요합니다. setupProject()를 실행해주세요.');
  return SpreadsheetApp.openById(id);
}

function verifyAdmin_(password) {
  const savedHash = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_HASH');
  if (!savedHash || !password || !constantTimeEqual_(savedHash, hashText_(String(password)))) {
    throw new Error('관리자 비밀번호가 올바르지 않습니다.');
  }
}

function bridgeResponse_(requestId, ok, data, error, requestedOrigin) {
  const allowedOrigins = getAllowedOrigins_();
  if (!allowedOrigins.includes(requestedOrigin)) {
    throw new Error('허용되지 않은 웹사이트 요청입니다. Apps Script의 ALLOWED_ORIGINS를 확인해주세요.');
  }

  const message = safeJson_({
    channel: 'meal-application',
    requestId: requestId,
    ok: ok,
    data: data,
    error: error
  });
  const targetOrigin = JSON.stringify(requestedOrigin);

  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><script>' +
    'window.top.postMessage(' + message + ',' + targetOrigin + ');' +
    '</script>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAllowedOrigins_() {
  const raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGINS') || '[]';
  try {
    return JSON.parse(raw).map(String);
  } catch (_) {
    return [];
  }
}

function parsePayload_(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    throw new Error('요청 데이터 형식이 올바르지 않습니다.');
  }
}

function validateDate_(value) {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜 형식이 올바르지 않습니다.');
  const parsed = new Date(`${date}T00:00:00+09:00`);
  if (isNaN(parsed.getTime())) throw new Error('유효하지 않은 날짜입니다.');
  return date;
}

function validateTime_(value, label) {
  const time = String(value || '');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`${label}을 입력해주세요.`);
  return time;
}

function validateStatus_(value, label) {
  const status = String(value || '');
  if (!APP.STATUS_VALUES.includes(status)) throw new Error(`${label} 신청 여부를 선택해주세요.`);
  return status;
}

function cleanText_(value, maxLength, label) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) throw new Error(`${label}을 입력해주세요.`);
  if (text.length > maxLength) throw new Error(`${label}은 ${maxLength}자 이내로 입력해주세요.`);
  return text;
}

function cleanOptionalText_(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length > maxLength) throw new Error(`${maxLength}자 이내로 입력해주세요.`);
  return text;
}

function normalizeKey_(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase();
}

function normalizeSheetDate_(value) {
  if (value instanceof Date) return formatDate_(value, 'yyyy-MM-dd');
  return String(value || '').slice(0, 10);
}

function normalizeTime_(value) {
  if (value instanceof Date) return formatDate_(value, 'HH:mm');
  const text = String(value || '');
  const match = text.match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function toBoolean_(value) {
  return value === true || String(value).toLowerCase() === 'true' || value === 1 || value === '1';
}

function formatKoreanDateLabel_(date) {
  const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const datePart = formatDate_(date, 'yyyy년 M월 d일');
  const weekdayIndex = Number(formatDate_(date, 'u')) % 7;
  return `${datePart} ${weekdays[weekdayIndex]}`;
}

function formatDate_(date, pattern) {
  const timezone = PropertiesService.getScriptProperties().getProperty('TIMEZONE') || SETUP.TIMEZONE;
  return Utilities.formatDate(date, timezone, pattern);
}

function hashText_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(byte => (byte + 256).toString(16).slice(-2))
    .join('');
}

function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function safeJson_(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
