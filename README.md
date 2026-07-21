<img width="973" height="881" alt="image" src="https://github.com/user-attachments/assets/790eccb3-5a12-4a15-88f6-073598587e59" />

## 🇸🇰 Slovensky

Skript na výpočet **výnosu z prebytkov FVE** (dodávka do siete) z portálu
**diportal.sk**. Vloží sa do konzoly prehliadača (F12) na prihlásenej stránke
`https://www.diportal.sk/portal/` pre Virtuálnu batériu Flexi od ZSE.

Čo robí:
1. **Overí prihlásenie** a získa **CSRF token** (`/api/security/checkUser`).
2. **Zistí obchodného partnera** a zdroj dát (`/api/commons/getUser`).
3. **Načíta odberné miesta** (`/api/delivery-points-list/loadDeliveryPoints`) —
   nič nie je natvrdo, OM sa vyberie automaticky (uprednostní typ SUPPLY, alebo
   podľa `CONFIG.eic`).
4. Po 7-dňových blokoch **stiahne 15-min intervalové dáta** profilu `PS_MINUS`
   (Činná dodávka) od `CONFIG.from` po dnes (`/api/interval-data/getProfileData`).
5. **Ocení** každý 15-min interval (kWh = kW ÷ 4) podľa pásmovej tarify:
   - Pracovný deň: Pásmo 1 (00–10 h), Pásmo 2 (10–18 h), Pásmo 3 (18–24 h)
   - Víkend/sviatok: Pásmo 4 (celý deň) — sviatky vrátane pohyblivej Veľkej noci
6. Vypíše tabuľky **po pásmach, po mesiacoch a po dňoch** + celkovú sumu v € (SPOLU).
   Stĺpec `portal_kWh` je kontrolný súčet z portálu.

Nastavenie hore v `CONFIG`: dátum od (`from`), OM (`eic`, `null` = automaticky),
ceny za kWh (`prices`).

## 🇬🇧 English

Script that computes **PV surplus (grid feed-in) revenue** from the Slovak
**diportal.sk** portal. Paste it into the browser console (F12) while logged in
at `https://www.diportal.sk/portal/` for Virtual battery Flexi by ZSE.

What it does:
1. **Verifies the session** and grabs the **CSRF token** (`/api/security/checkUser`).
2. **Discovers the business partner** and data source (`/api/commons/getUser`).
3. **Loads the delivery points** (`/api/delivery-points-list/loadDeliveryPoints`) —
   nothing is hardcoded; it auto-selects the meter (prefers SUPPLY type, or the one
   matching `CONFIG.eic`).
4. In 7-day chunks it **fetches 15-min interval data** for the `PS_MINUS` profile
   (grid export) from `CONFIG.from` to today (`/api/interval-data/getProfileData`).
5. **Prices** each 15-min slot (kWh = kW ÷ 4) by time-of-use band:
   - Weekday: Band 1 (00–10), Band 2 (10–18), Band 3 (18–24)
   - Weekend/holiday: Band 4 (whole day) — holidays include movable Easter dates
6. Prints **per-band, per-month and per-day** tables plus the total € (SPOLU).
   The `portal_kWh` column is the portal's own daily total, used as a cross-check.

Config at the top (`CONFIG`): start date (`from`), meter (`eic`, `null` = auto),
per-kWh prices (`prices`).
