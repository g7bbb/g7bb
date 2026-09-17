/**
 * 곤충 배틀 베타 - 구글 시트 기록용 스크립트
 *
 * 앱에서 참가 기록(고른 설정 / 받고 싶은 선물 / 설문 답변)을 보내면
 * 구글 시트에 한 줄씩 자동으로 쌓입니다.
 *
 * ── 설치 방법 ─────────────────────────────────────────────
 * 1. 구글 시트를 새로 하나 만듭니다.
 * 2. 상단 메뉴 [확장 프로그램] → [Apps Script] 를 엽니다.
 * 3. 기본으로 들어있는 내용을 전부 지우고, 이 파일 내용을 그대로 붙여넣습니다.
 * 4. 아래 TOKEN 값을 아무도 모르는 문자열로 바꿉니다 (영문+숫자 20자 내외).
 * 5. 오른쪽 위 [배포] → [새 배포] → 유형 [웹 앱] 선택
 *      - 실행 계정: 나
 *      - 액세스 권한: 모든 사용자
 *    → [배포] 를 누르고 권한을 승인합니다.
 * 6. 나온 "웹 앱 URL"을 복사해둡니다 (https://script.google.com/macros/s/... 형태).
 * 7. 그 URL과 TOKEN을 앱 환경변수 SHEETS_WEBHOOK_URL / SHEETS_WEBHOOK_TOKEN 에 넣습니다.
 *
 * ── 확인 방법 ─────────────────────────────────────────────
 * 복사한 웹 앱 URL을 브라우저 주소창에 그냥 붙여넣어 보세요.
 * {"ok":true,...} 같은 글자가 보이면 배포가 정상입니다.
 *
 * ── 참고 ─────────────────────────────────────────────────
 * 보내는 항목이 늘어나도(설문 문항 추가 등) 시트를 다시 만들 필요가 없습니다.
 * 새로운 항목이 들어오면 맨 오른쪽에 칸을 자동으로 추가합니다.
 */

// 아무도 모르는 문자열로 바꿔주세요. 앱 환경변수 SHEETS_WEBHOOK_TOKEN 과 똑같아야 합니다.
const TOKEN = '여기에_비밀문자열_붙여넣기';

// 기록이 쌓일 시트(탭) 이름. 없으면 자동으로 만들어집니다.
const SHEET_NAME = '참가자';

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // 여러 아이가 동시에 시작해도 줄이 섞이지 않도록 순서를 지킵니다.
    lock.waitLock(20000);

    const body = JSON.parse(e.postData.contents);

    if (!TOKEN || body.token !== TOKEN) {
      return reply({ ok: false, error: 'invalid token' });
    }

    const row = body.row;
    if (!row || typeof row !== 'object') {
      return reply({ ok: false, error: 'row missing' });
    }

    appendRow(row);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// 배포가 잘 됐는지 브라우저에서 눈으로 확인하기 위한 응답입니다.
function doGet() {
  return reply({ ok: true, message: '곤충 배틀 시트 기록기가 동작 중입니다.' });
}

function appendRow(row) {
  const sheet = getSheet();
  let headers = readHeaders(sheet);

  // 처음 보는 항목이 있으면 헤더 오른쪽에 칸을 새로 만듭니다.
  const missing = Object.keys(row).filter(function (key) {
    return headers.indexOf(key) === -1;
  });

  if (missing.length) {
    headers = headers.concat(missing);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  sheet.appendRow(headers.map(function (header) {
    return formatCell(row[header]);
  }));
}

function readHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return [];
  return sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(String);
}

function formatCell(value) {
  if (value === undefined || value === null) return '';
  // 부위 점수처럼 여러 값이 묶인 항목은 한 칸에 글자로 풀어서 넣습니다.
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function reply(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
