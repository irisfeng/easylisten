/**
 * 把段落切成朗读单位，保留结尾标点。
 * 英文句点只有不位于两个数字之间时才是句末，避免把 5.26 拆成两句。
 */
export function splitSentences(paragraphs) {
  const out = [];

  for (const paragraph of paragraphs) {
    let start = 0;
    for (let i = 0; i < paragraph.length; i++) {
      const char = paragraph[i];
      const isDecimalPoint =
        char === "." && /\d/.test(paragraph[i - 1] ?? "") && /\d/.test(paragraph[i + 1] ?? "");
      const isSentenceEnd = /[。!?！？]/.test(char) || (char === "." && !isDecimalPoint);
      if (!isSentenceEnd) continue;

      const sentence = paragraph.slice(start, i + 1).trim();
      if (sentence) out.push(sentence);
      start = i + 1;
    }

    const rest = paragraph.slice(start).trim();
    if (rest) out.push(rest);
  }

  return out;
}

const CHINESE_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const SMALL_UNITS = ["", "十", "百", "千"];
const LARGE_UNITS = ["", "万", "亿", "兆"];
const MAX_PRONUNCIATION_RULES_PER_REQUEST = 32;

function sectionToChinese(section) {
  let value = section;
  let unit = 0;
  let pendingZero = false;
  let result = "";
  while (value > 0) {
    const digit = value % 10;
    if (digit === 0) {
      if (result) pendingZero = true;
    } else {
      const zero = pendingZero ? "零" : "";
      result = `${CHINESE_DIGITS[digit]}${SMALL_UNITS[unit]}${zero}${result}`;
      pendingZero = false;
    }
    value = Math.floor(value / 10);
    unit++;
  }
  return result;
}

function integerToChinese(raw) {
  const digits = raw.replace(/^0+(?=\d)/, "");
  if (digits === "0") return CHINESE_DIGITS[0];
  if (digits.length > 16) return [...digits].map((digit) => CHINESE_DIGITS[Number(digit)]).join("");

  let value = BigInt(digits);
  let group = 0;
  let result = "";
  let needsZero = false;
  while (value > 0n) {
    const section = Number(value % 10000n);
    if (section === 0) {
      if (result) needsZero = true;
    } else {
      const separator = (needsZero || (section < 1000 && result)) ? "零" : "";
      result = `${sectionToChinese(section)}${LARGE_UNITS[group] ?? ""}${separator}${result}`;
      needsZero = false;
    }
    value /= 10000n;
    group++;
  }
  return result.replace(/^一十/, "十");
}

function spokenNumber(raw) {
  const compact = raw.replaceAll(",", "");
  const negative = compact.startsWith("-");
  const unsigned = negative ? compact.slice(1) : compact;
  const [integer, fraction] = unsigned.split(".");
  const spokenInteger = integerToChinese(integer);
  const spokenFraction = fraction
    ? `点${[...fraction].map((digit) => CHINESE_DIGITS[Number(digit)]).join("")}`
    : "";
  return `${negative ? "负" : ""}${spokenInteger}${spokenFraction}`;
}

function spokenYear(raw) {
  return [...raw].map((digit) => CHINESE_DIGITS[Number(digit)]).join("");
}

function completeRangeYear(start, end) {
  if (end.length === 4) return end;
  let value = Math.floor(Number(start) / 100) * 100 + Number(end);
  if (value < Number(start)) value += 100;
  return String(value).padStart(4, "0");
}

function spokenDecade(raw) {
  const year = Number(raw);
  const century = Math.floor(year / 100) + 1;
  const decade = year % 100;
  return decade === 0
    ? `${integerToChinese(String(century))}世纪最初十年`
    : `${integerToChinese(String(century))}世纪${integerToChinese(String(decade))}年代`;
}

/**
 * 为中文稿中的全大写缩写和字母数字型号生成 MiniMax pronunciation_dict。
 * 固定规则优先，可用于人名、多音字和业务词；自动规则只处理形态明确的标识，
 * 不拆 DeepMind、SpaceX 这类应自然朗读的普通英文专名。
 */
export function buildPronunciationDictionary(text, fixedRules = []) {
  const rules = [];
  const covered = new Set();
  const add = (rule) => {
    const slash = rule.indexOf("/");
    if (slash <= 0) return;
    const source = rule.slice(0, slash);
    if (!text.includes(source) || covered.has(source)) return;
    covered.add(source);
    rules.push(rule);
  };

  for (const rule of fixedRules) add(rule);
  for (const [identifier] of text.matchAll(/\b[A-Z]{2,}[A-Za-z0-9]*\b/g)) {
    if (covered.has(identifier)) continue;
    const pronunciation = [...identifier]
      .map((char) => (/\d/.test(char) ? CHINESE_DIGITS[Number(char)] : char.toUpperCase()))
      .join(" ");
    add(`${identifier}/${pronunciation}`);
    if (rules.length >= MAX_PRONUNCIATION_RULES_PER_REQUEST) break;
  }

  return rules.slice(0, MAX_PRONUNCIATION_RULES_PER_REQUEST);
}

/** MiniMax T2A 的原生文本控制参数。 */
export function buildMiniMaxTextOptions(text, fixedRules = [], language = "zh") {
  if (language === "en") {
    return {
      language_boost: "English",
      english_normalization: true,
    };
  }
  const tone = buildPronunciationDictionary(text, fixedRules);
  return {
    language_boost: "Chinese",
    ...(tone.length ? { pronunciation_dict: { tone } } : {}),
  };
}

/**
 * 生成专供 TTS 的文本；页面仍显示原文。
 * 中文数字先做确定性改写，避免不同云音色各自猜测小数点和百分号的语义。
 */
export function normalizeForSpeech(text, language = "zh") {
  if (language !== "zh") return text;

  const numberPattern = "-?\\d[\\d,]*(?:\\.\\d+)?";
  const speak = (number) => spokenNumber(number);

  let normalized = text
    .replace(/(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g, (_, year, month, day) =>
      `${spokenYear(year)}年${speak(month)}月${speak(day)}日`)
    .replace(/(\d{4})年?\s*[~～–—至到-]\s*(\d{2,4})年/g, (_, start, end) =>
      `${spokenYear(start)}到${spokenYear(completeRangeYear(start, end))}年`)
    .replace(/(\d{4})年代/g, (_, year) => spokenDecade(year))
    .replace(/(\d{4})年/g, (_, year) => `${spokenYear(year)}年`)
    .replace(/(?:HK\$|HKD)\s*(-?\d[\d,]*(?:\.\d+)?)\s*[~～–—至到-]\s*(?:HK\$|HKD)?\s*(-?\d[\d,]*(?:\.\d+)?)/gi, (_, from, to) =>
      `${speak(from)}到${speak(to)}港元`)
    .replace(/(?:US\$|USD|\$)\s*(-?\d[\d,]*(?:\.\d+)?)\s*[~～–—至到-]\s*(?:US\$|USD|\$)?\s*(-?\d[\d,]*(?:\.\d+)?)/gi, (_, from, to) =>
      `${speak(from)}到${speak(to)}美元`)
    .replace(/(?:CN¥|CNY|RMB|[¥￥])\s*(-?\d[\d,]*(?:\.\d+)?)\s*[~～–—至到-]\s*(?:CN¥|CNY|RMB|[¥￥])?\s*(-?\d[\d,]*(?:\.\d+)?)/gi, (_, from, to) =>
      `${speak(from)}到${speak(to)}元`)
    .replace(/(?:EUR|€)\s*(-?\d[\d,]*(?:\.\d+)?)\s*[~～–—至到-]\s*(?:EUR|€)?\s*(-?\d[\d,]*(?:\.\d+)?)/gi, (_, from, to) =>
      `${speak(from)}到${speak(to)}欧元`)
    .replace(/(?:GBP|£)\s*(-?\d[\d,]*(?:\.\d+)?)\s*[~～–—至到-]\s*(?:GBP|£)?\s*(-?\d[\d,]*(?:\.\d+)?)/gi, (_, from, to) =>
      `${speak(from)}到${speak(to)}英镑`)
    .replace(/(?:HK\$|HKD)\s*(-?\d[\d,]*(?:\.\d+)?)/gi, (_, number) => `${speak(number)}港元`)
    .replace(/(?:US\$|USD|\$)\s*(-?\d[\d,]*(?:\.\d+)?)/gi, (_, number) => `${speak(number)}美元`)
    .replace(/(?:CN¥|CNY|RMB|[¥￥])\s*(-?\d[\d,]*(?:\.\d+)?)\s*(万|亿)?元?/gi, (_, number, scale) =>
      `${speak(number)}${scale ?? ""}元`)
    .replace(/(?:EUR|€)\s*(-?\d[\d,]*(?:\.\d+)?)/gi, (_, number) => `${speak(number)}欧元`)
    .replace(/(?:GBP|£)\s*(-?\d[\d,]*(?:\.\d+)?)/gi, (_, number) => `${speak(number)}英镑`)
    .replace(/(\d[\d,]*)\s*\/\s*(\d[\d,]*)/g, (_, numerator, denominator) =>
      `${speak(denominator)}分之${speak(numerator)}`)
    .replace(/(\d{1,2}):(\d{2})(?!\d)/g, (_, hour, minute) => {
      const spokenMinute = Number(minute) === 0 ? "" : `${speak(minute)}分`;
      return `${speak(hour)}点${spokenMinute}`;
    })
    .replace(new RegExp(`(-?)(${numberPattern.replace("-?", "")})\\s*[℃°]`, "g"), (_, minus, number) =>
      `${minus ? "零下" : ""}${speak(number)}摄氏度`)
    .replace(new RegExp(`(${numberPattern})\\s*[~～–—]\\s*(${numberPattern})`, "g"), (_, from, to) =>
      `${speak(from)}到${speak(to)}`)
    .replace(new RegExp(`(${numberPattern})\\s*[:：]\\s*(${numberPattern})`, "g"), (_, left, right) =>
      `${speak(left)}比${speak(right)}`)
    .replace(/±\s*/g, "正负")
    .replace(new RegExp(`(${numberPattern})\\s*[×xX]\\s*(${numberPattern})`, "g"), (_, left, right) =>
      `${speak(left)}乘${speak(right)}`)
    .replace(new RegExp(`(${numberPattern})\\s*÷\\s*(${numberPattern})`, "g"), (_, left, right) =>
      `${speak(left)}除以${speak(right)}`)
    .replace(/\s*=\s*/g, "等于")
    .replace(/(-?\d[\d,]*(?:\.\d+)?)\s*[%％]/g, (_, number) => `百分之${spokenNumber(number)}`)
    .replace(/(?<![A-Za-z0-9])-?\d[\d,]*(?:\.\d+)?(?![A-Za-z0-9])/g, (number) => spokenNumber(number));
  return normalized;
}

/** 合成前审计：中文朗读稿里不应再有独立阿拉伯数字或裸货币符号。 */
export function findSpeechNormalizationIssues(text, language = "zh") {
  if (language !== "zh") return [];
  const normalized = normalizeForSpeech(text, language);
  return [
    ...new Set(
      normalized.match(/[\$¥￥€£₽₹₩]|(?<![A-Za-z0-9])\d[\d,.]*(?![A-Za-z0-9])/g) ?? [],
    ),
  ];
}
