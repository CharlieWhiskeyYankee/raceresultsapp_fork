/**
 * config.js
 * Static configuration and reference data for the Lysterfield Sailing Club app.
 */

// Google Apps Script Web App endpoint for cloud persistence.
export const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzhem1VN12cxR54nQvZKvcXFs8q-Mg_7PEP5M-CqcLWx4eEOT__hxqe-N_UfebYTXKQ/exec';

// Yardstick reference data.
export const YARDSTICK_DATA = [
    { boatClass: "125",                  yardstick: 123 },
    { boatClass: "145",                  yardstick: 113 },
    { boatClass: "29er",                 yardstick: 95 },
    { boatClass: "420",                  yardstick: 112 },
    { boatClass: "470",                  yardstick: 101 },
    { boatClass: "505",                  yardstick: 93 },
    { boatClass: "B14",                  yardstick: 94 },
    { boatClass: "Byte",                 yardstick: 125.4 },
    { boatClass: "Byte CII",             yardstick: 120.4 },
    { boatClass: "Cherub",               yardstick: 100 },
    { boatClass: "Contender",            yardstick: 106.5 },
    { boatClass: "Corsair",              yardstick: 119.5 },
    { boatClass: "E Class (Lazy E)",     yardstick: 113 },
    { boatClass: "Europe Dinghy",        yardstick: 120 },
    { boatClass: "Fireball",             yardstick: 101 },
    { boatClass: "Finn",                 yardstick: 110 },
    { boatClass: "Flying Ant",           yardstick: 136 },
    { boatClass: "Flying 11",            yardstick: 117 },
    { boatClass: "Heron",                yardstick: 134 },
    { boatClass: "Impulse",              yardstick: 118.5 },
    { boatClass: "Impulse 6.6",          yardstick: 124.5 },
    { boatClass: "Javelin",              yardstick: 97.5 },
    { boatClass: "Jubilee",              yardstick: 130 },
    { boatClass: "Laser",                yardstick: 114 },
    { boatClass: "Laser Radial",         yardstick: 118.5 },
    { boatClass: "Laser 4.7",            yardstick: 127 },
    { boatClass: "Mirror",               yardstick: 143 },
    { boatClass: "Moth Skiff",           yardstick: 110 },
    { boatClass: "Moth Scow",            yardstick: 115 },
    { boatClass: "NS14",                 yardstick: 108 },
    { boatClass: "OK Dinghy",            yardstick: 115.5 },
    { boatClass: "Open Bic",             yardstick: 153.3 },
    { boatClass: "Optimist",             yardstick: 170 },
    { boatClass: "Pacer",                yardstick: 127.5 },
    { boatClass: "Pacer Non Spinnaker",  yardstick: 130.4 },
    { boatClass: "RS 100 8.4",           yardstick: 106 },
    { boatClass: "RS 100 10.2",          yardstick: 103 },
    { boatClass: "RS 200",               yardstick: 108.5 },
    { boatClass: "RS 300",               yardstick: 103.4 },
    { boatClass: "RS 400",               yardstick: 96.6 },
    { boatClass: "RS 500",               yardstick: 102.7 },
    { boatClass: "RS 600",               yardstick: 87.2 },
    { boatClass: "RS 700",               yardstick: 83.8 },
    { boatClass: "RS 800",               yardstick: 86.3 },
    { boatClass: "RS Aero 5",            yardstick: 116.8 },
    { boatClass: "RS Aero 6",            yardstick: 114.6 },
    { boatClass: "RS Aero 7",            yardstick: 112.5 },
    { boatClass: "RS Aero 9",            yardstick: 108 },
    { boatClass: "RS Feva XL",           yardstick: 130 },
    { boatClass: "RS Tera Pro",          yardstick: 143.2 },
    { boatClass: "RS Tera Sport",        yardstick: 153.9 },
    { boatClass: "RS Vareo",             yardstick: 113.1 },
    { boatClass: "RS Vision",            yardstick: 123.7 },
    { boatClass: "Sabre",                yardstick: 127 },
    { boatClass: "Sailfish",             yardstick: 132 },
    { boatClass: "Sabot",                yardstick: 160.5 },
    { boatClass: "Sharpie",              yardstick: 95 },
    { boatClass: "Solo",                 yardstick: 123.5 },
    { boatClass: "Sparrow",              yardstick: 145 },
    { boatClass: "Spiral",               yardstick: 124 },
    { boatClass: "Tasar",                yardstick: 108 },
];

// Valid race status codes.
export const RACE_STATUSES = ['', 'finished', 'DNF', 'DNS', 'OCS', 'DSQ', 'OOD'];

// Available divisions.
export const DIVISIONS = ['1', '2'];

// Export format version string embedded in JSON backups.
export const EXPORT_VERSION = 'LysterfieldResultsApp_vGS_1.14_SC_Timer';
