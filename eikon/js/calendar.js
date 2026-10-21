/* Eikon — liturgical calendar engine.
   Computes Pascha (Julian Paschalion, used by all Orthodox churches), the movable cycle,
   fixed commemorations for either the Revised Julian ("New") or Julian ("Old") calendar,
   and a simplified fasting guide. */
(function () {
  const DAY = 86400000;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  // Dates are handled as UTC midnights to avoid DST drift.
  const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
  const addDays = (date, n) => new Date(date.getTime() + n * DAY);
  const diffDays = (a, b) => Math.round((a.getTime() - b.getTime()) / DAY);
  const key = (date) => String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");
  const today = () => { const n = new Date(); return utc(n.getFullYear(), n.getMonth(), n.getDate()); };

  // Difference between the Julian and Gregorian calendars (13 days for 1900–2099).
  function julianOffset(year) {
    const c = Math.floor(year / 100);
    return c - Math.floor(c / 4) - 2;
  }

  // Meeus' Julian algorithm, converted to a civil (Gregorian) date.
  const paschaCache = {};
  function pascha(year) {
    if (paschaCache[year]) return paschaCache[year];
    const a = year % 4, b = year % 7, c = year % 19;
    const d = (19 * c + 15) % 30;
    const e = (2 * a + 4 * b - d + 34) % 7;
    const month = Math.floor((d + e + 114) / 31);
    const day = ((d + e + 114) % 31) + 1;
    return (paschaCache[year] = addDays(utc(year, month - 1, day), julianOffset(year)));
  }

  // Movable cycle, offsets in days from Pascha.
  const MOVABLE = [
    [-70, "Sunday of the Publican and the Pharisee", "triodion"],
    [-63, "Sunday of the Prodigal Son", "triodion"],
    [-57, "Saturday of Souls (Meatfare)", "triodion"],
    [-56, "Sunday of the Last Judgment (Meatfare)", "triodion"],
    [-49, "Forgiveness Sunday (Cheesefare): Expulsion of Adam from Paradise", "triodion"],
    [-48, "Clean Monday: the beginning of Great Lent", "major"],
    [-43, "St Theodore the Recruit and the Miracle of the Kolyva", "triodion"],
    [-42, "Sunday of Orthodoxy: the Triumph over Iconoclasm", "major"],
    [-35, "Second Sunday of Lent: St Gregory Palamas", "triodion"],
    [-28, "Third Sunday of Lent: Veneration of the Holy Cross", "major"],
    [-21, "Fourth Sunday of Lent: St John Climacus", "triodion"],
    [-17, "Thursday of the Great Canon of St Andrew of Crete", "triodion"],
    [-15, "Saturday of the Akathist", "triodion"],
    [-14, "Fifth Sunday of Lent: St Mary of Egypt", "triodion"],
    [-8, "Lazarus Saturday: the Raising of Lazarus", "major"],
    [-7, "Entry of Our Lord into Jerusalem (Palm Sunday)", "great"],
    [-6, "Great and Holy Monday", "holy"],
    [-5, "Great and Holy Tuesday", "holy"],
    [-4, "Great and Holy Wednesday", "holy"],
    [-3, "Great and Holy Thursday: the Mystical Supper", "holy"],
    [-2, "Great and Holy Friday: the Passion and Burial of Christ", "holy"],
    [-1, "Great and Holy Saturday: the Descent into Hades", "holy"],
    [0, "Holy Pascha: the Resurrection of Our Lord", "pascha"],
    [1, "Bright Monday", "bright"], [2, "Bright Tuesday", "bright"],
    [3, "Bright Wednesday", "bright"], [4, "Bright Thursday", "bright"],
    [5, "Bright Friday: the Life-giving Spring", "bright"], [6, "Bright Saturday", "bright"],
    [7, "Thomas Sunday (Antipascha)", "major"],
    [14, "Sunday of the Myrrh-bearing Women", "triodion"],
    [21, "Sunday of the Paralytic", "triodion"],
    [24, "Mid-Pentecost", "triodion"],
    [28, "Sunday of the Samaritan Woman", "triodion"],
    [35, "Sunday of the Blind Man", "triodion"],
    [38, "Leavetaking of Pascha", "triodion"],
    [39, "Ascension of Our Lord", "great"],
    [42, "Sunday of the Holy Fathers of the First Ecumenical Council", "triodion"],
    [48, "Saturday of Souls (before Pentecost)", "triodion"],
    [49, "Holy Pentecost: the Descent of the Holy Spirit", "great"],
    [50, "Monday of the Holy Spirit", "major"],
    [56, "Sunday of All Saints", "major"],
  ];
  const MOVABLE_BY_OFFSET = Object.fromEntries(MOVABLE.map((m) => [m[0], m]));

  function parseMenaion(str) {
    if (!str) return [];
    return str.split("|").map((s) => {
      let rank = "saint";
      if (s.endsWith("**")) { rank = "great"; s = s.slice(0, -2); }
      else if (s.endsWith("*")) { rank = "major"; s = s.slice(0, -1); }
      return { name: s, rank };
    });
  }

  /* Fasting rules (simplified). `church` is the date on the calendar in use,
     `p` the day's offset from Pascha, `dow` the civil weekday. */
  function fasting(church, p, dow, apostlesEnd) {
    const k = key(church);
    const m = church.getUTCMonth() + 1, d = church.getUTCDate();
    const isWF = dow === 3 || dow === 5;

    if (p >= 0 && p <= 6) return { level: "free", label: "Fast-free", note: "Bright Week" };
    if (p >= 50 && p <= 55) return { level: "free", label: "Fast-free", note: "Week after Pentecost" };
    if (p >= -69 && p <= -64) return { level: "free", label: "Fast-free", note: "Week of the Publican and Pharisee" };
    if ((m === 12 && d >= 25) || (m === 1 && d <= 4)) return { level: "free", label: "Fast-free", note: "Twelve days of Christmas" };

    if (["01-05", "08-29", "09-14"].includes(k)) return { level: "strict", label: "Strict fast", note: "A day of strict fasting" };
    if (k === "12-24") return { level: "strict", label: "Strict fast", note: "Eve of the Nativity" };

    if (p >= -55 && p <= -49) return { level: "dairy", label: "Meat-fast", note: "Cheesefare Week: dairy, eggs and fish permitted" };
    if (p >= -48 && p <= -1) {
      if (k === "03-25") return { level: "fish", label: "Fish permitted", note: "Great Lent, Feast of the Annunciation" };
      if (p === -7) return { level: "fish", label: "Fish permitted", note: "Palm Sunday" };
      if (p === -8) return { level: "oil", label: "Wine and oil", note: "Lazarus Saturday: fish roe permitted" };
      if (p === -2) return { level: "strict", label: "Strict fast", note: "Great and Holy Friday" };
      if (p >= -6) return { level: "strict", label: "Strict fast", note: "Holy Week" };
      if (dow === 0 || dow === 6) return { level: "oil", label: "Wine and oil", note: "Great Lent" };
      return { level: "strict", label: "Strict fast", note: "Great Lent" };
    }
    if (p >= 57 && church <= apostlesEnd) {
      return isWF ? { level: "oil", label: "Wine and oil", note: "Apostles' Fast" }
                  : { level: "fish", label: "Fish permitted", note: "Apostles' Fast" };
    }
    if (m === 8 && d >= 1 && d <= 14) {
      if (d === 6) return { level: "fish", label: "Fish permitted", note: "Dormition Fast, Transfiguration" };
      return (dow === 0 || dow === 6) ? { level: "oil", label: "Wine and oil", note: "Dormition Fast" }
                                      : { level: "strict", label: "Strict fast", note: "Dormition Fast" };
    }
    if ((m === 11 && d >= 15) || (m === 12 && d <= 23)) {
      if (m === 12 && d >= 20) return { level: "oil", label: "Wine and oil", note: "Nativity Fast, the final days" };
      if (k === "11-21") return { level: "fish", label: "Fish permitted", note: "Nativity Fast, Entry of the Theotokos" };
      return isWF ? { level: "oil", label: "Wine and oil", note: "Nativity Fast" }
                  : { level: "fish", label: "Fish permitted", note: "Nativity Fast" };
    }
    if (isWF) {
      if (["02-02", "08-06", "01-06"].includes(k)) return { level: "fish", label: "Fish permitted", note: "A Great Feast falls on a fast day" };
      return { level: "fast", label: "Fast day", note: dow === 3 ? "Wednesday: the betrayal of Christ" : "Friday: the Crucifixion" };
    }
    return { level: "free", label: "No fast", note: "" };
  }

  /* Everything about one civil day. style: "new" (Revised Julian) or "old" (Julian). */
  function dayInfo(civil, style) {
    style = style || "new";
    const y = civil.getUTCFullYear();
    const church = style === "old" ? addDays(civil, -julianOffset(y)) : civil;
    let p = diffDays(civil, pascha(y));
    const dow = civil.getUTCDay();
    const movable = MOVABLE_BY_OFFSET[p];
    const fixed = parseMenaion(window.EIKON_MENAION[key(church)]);
    const commemorations = [];
    if (movable) commemorations.push({ name: movable[1], rank: movable[2], movable: true });
    commemorations.push(...fixed);
    if (dow === 0 && !movable && (p > 56 || p < -70)) commemorations.push({ name: "Sunday of the Resurrection", rank: "sunday" });

    const apostlesEnd = utc(church.getUTCFullYear(), 5, 28);
    const fast = fasting(church, p, dow, apostlesEnd);
    return {
      civil, church, style, pascha: pascha(y), paschaOffset: p, weekday: WEEKDAYS[dow],
      churchKey: key(church), movableKey: "pascha" + (p >= 0 ? "+" : "") + p,
      commemorations, fast,
      principal: commemorations.find((c) => c.rank === "great" || c.rank === "pascha" || c.rank === "holy")
              || commemorations.find((c) => c.rank === "major") || commemorations[0],
    };
  }

  function formatDate(d, opts) {
    opts = opts || {};
    const s = MONTHS[d.getUTCMonth()] + " " + d.getUTCDate();
    return opts.year ? s + ", " + d.getUTCFullYear() : s;
  }
  function formatKey(k) {
    const [m, d] = k.split("-").map(Number);
    return MONTHS[m - 1] + " " + d;
  }

  window.EikonCalendar = { utc, addDays, diffDays, key, today, pascha, julianOffset, dayInfo, formatDate, formatKey, MONTHS, WEEKDAYS, MOVABLE };
})();
