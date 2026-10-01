/**
 * Artiz COD Form Engine - Saudi Arabia Regional Locations & Datasets
 * Country Code: SA
 * Modular Country Dataset (Auto-loaded on-demand)
 */
window.ARTIZ_LOCATIONS = window.ARTIZ_LOCATIONS || {};

window.ARTIZ_LOCATIONS["SA"] = {
  name: "السعودية",
  currency: "SAR",
  phonePlaceholder: "مثال: 0512345678",
  defaultRegion: "منطقة الرياض",
  regions: {
    "منطقة الرياض": ["الرياض", "الخرج", "الدرعية", "الدوادمي", "المجمعة", "وادي الدواسر", "الزلفي"],
    "منطقة مكة المكرمة": ["مكة المكرمة", "جدة", "الطائف", "رابغ", "القنفذة", "الليث"],
    "المنطقة الشرقية": ["الدمام", "الخبر", "الظهران", "الأحساء", "الجبيل", "القطيف", "حفر الباطن"],
    "منطقة المدينة المنورة": ["المدينة المنورة", "ينبع", "العلا", "بدر", "خيبر"],
    "منطقة القصيم": ["بريدة", "عنيزة", "الرس", "البكيرية", "المذنب"],
    "منطقة عسير": ["أبها", "خميس مشيط", "أحد رفيدة", "بيشة", "محايل عسير"]
  },
  aliases: {
    "riyadh": { city: "الرياض", region: "منطقة الرياض" },
    "kharj": { city: "الخرج", region: "منطقة الرياض" },
    "diriyah": { city: "الدرعية", region: "منطقة الرياض" },
    "jeddah": { city: "جدة", region: "منطقة مكة المكرمة" },
    "makkah": { city: "مكة المكرمة", region: "منطقة مكة المكرمة" },
    "mecca": { city: "مكة المكرمة", region: "منطقة مكة المكرمة" },
    "taif": { city: "الطائف", region: "منطقة مكة المكرمة" },
    "dammam": { city: "الدمام", region: "المنطقة الشرقية" },
    "khobar": { city: "الخبر", region: "المنطقة الشرقية" },
    "dhahran": { city: "الظهران", region: "المنطقة الشرقية" },
    "ahsa": { city: "الأحساء", region: "المنطقة الشرقية" },
    "jubail": { city: "الجبيل", region: "المنطقة الشرقية" },
    "madinah": { city: "المدينة المنورة", region: "منطقة المدينة المنورة" },
    "medina": { city: "المدينة المنورة", region: "منطقة المدينة المنورة" },
    "yanbu": { city: "ينبع", region: "منطقة المدينة المنورة" },
    "buraydah": { city: "بريدة", region: "منطقة القصيم" },
    "onaizah": { city: "عنيزة", region: "منطقة القصيم" },
    "abha": { city: "أبها", region: "منطقة عسير" },
    "khamis mushait": { city: "خميس مشيط", region: "منطقة عسير" }
  }
};
