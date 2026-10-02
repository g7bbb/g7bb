// 이름 금지어 (2026-10-02 Jin: "19금 언어를 금지어로 정해서 아이디로 못 만들게").
//
// 이름은 랭킹·갤러리·카드에 그대로 뜨고 다른 아이들이 본다. 그래서 막는다:
//   아이 이름(/start) · 곤충 이름(/start, /upload) · 기타 곤충 이름(/upload, 카드에 뜸)
//
// 검사 방법: 띄어쓰기·숫자·기호를 빼고 소문자로 바꾼 뒤 "들어 있는지" 본다.
//   → "씨 발", "씨1발", "S.E.X" 같은 꼼수도 걸린다.
//
// ⚠️ 정상 단어가 걸리지 않게 일부러 뺀 것 (아이 이름·곤충 이름에 자주 나온다):
//   변태(곤충 "완전변태"!) · 시바(시바견) · 고추 · 새끼(새끼 사슴벌레) · 미친 · 사정 · 섹시 ·
//   성기(성기사) · 야스(야스오) · 졸라(졸라맨) · 개세("개세다") ·
//   영어 cock(cockroach 바퀴벌레) · ass(class·grass) · cum(cucumber) · tit(titan) · anal(canal) · rape(grape)
// 단어를 더 넣고 싶으면 아래 목록에 한 줄 추가하면 된다.

const KOREAN = [
  // 성적인 말
  '섹스', '쎅스', '쎽스', '섹쓰', '보지', '자지', '보짓', '자짓', '꼬추', '젖꼭', '유두', '음경', '음부',
  '질싸', '야동', '포르노', '강간', '성폭', '자위', '딸딸', '정액', '콘돔', '오르가', '떡치', '빠구리',
  '창녀', '창놈', '매춘', '원조교', '불알', '부랄', '똥꼬충',
  // 욕
  '시발', '씨발', '씨바', '씨팔', '시팔', '씨빨', '쓰발', '쓰벌', '씹', '좆', '좇', '졷', '존나', '개새',
  '개색', '개쉐', '병신', '븅신', '빙신', '븽신', '등신', '지랄', '염병', '니미', '느금', '니애미',
  '애미', '엠창', '엄창', '미친년', '미친놈', '썅', '닥쳐',
  // 자음만 쓴 욕
  'ㅅㅂ', 'ㅆㅂ', 'ㅄ', 'ㅂㅅ', 'ㅈㄹ', 'ㅈㄴ', 'ㅗ', 'ㅅㅅ', 'ㅈㅈ', 'ㅂㅈ',
];

const ENGLISH = [
  'sex', 'fuck', 'fuk', 'shit', 'bitch', 'dick', 'pussy', 'porn', 'penis', 'vagina', 'boob', 'nude',
  'naked', 'hentai', 'slut', 'whore', 'nigg', 'cunt', 'horny', 'milf', 'xxx',
];

/** 한글·영어만 남기고 소문자로. 영어는 0→o 같은 숫자 꼼수도 되돌린다. */
function squash(text: string, leet: boolean): string {
  let s = text.normalize('NFC').toLowerCase();
  if (leet) {
    s = s.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4|@/g, 'a').replace(/5|\$/g, 's');
    // 같은 글자 늘이기도 접는다 ("fuuuck" → "fuck"). 접힌 쪽에 맞추려고 목록 단어도 접어서 비교한다.
    return s.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z]/g, '').replace(/(.)\1+/g, '$1');
  }
  return s.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z]/g, '');
}

/** 금지어가 들어 있으면 true. */
export function hasBadWord(text: string | null | undefined): boolean {
  if (!text) return false;
  const plain = squash(text, false);
  const leet = squash(text, true);
  return (
    KOREAN.some((w) => plain.includes(w)) ||
    ENGLISH.some((w) => plain.includes(w) || leet.includes(w.replace(/(.)\1+/g, '$1')))
  );
}

/** 화면에 띄울 말 (반말). */
export const BAD_WORD_MESSAGE = '그 말은 이름으로 쓸 수 없어! 다른 멋진 이름을 지어줘 🙂';
