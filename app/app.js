let dealId = null;
let exchangeRateNBU = null;
let exchangeRateDeal = null;
let currentLang = localStorage.getItem('lang') || 'uk';

const rateFieldAPIName = 'Currency_Rate';
const nbuUrl = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json';
const historyModule = 'Exchange_Rate_History';

function log(message) {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.textContent = `${time} — ${message}`;
  document.getElementById("log").prepend(entry);
}

function applyTranslations(translations) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[key]) {
      el.textContent = translations[key];
    }
  });
}

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  fetch(`translations/${currentLang}.json`)
    .then(res => res.json())
    .then(applyTranslations)
    .catch(() => log("⚠️ Помилка завантаження перекладу"));
}

document.addEventListener('DOMContentLoaded', function () {
  const select = document.getElementById("lang-select");
  if (select) {
    select.value = currentLang;
    select.addEventListener("change", e => setLanguage(e.target.value));
  }

  setLanguage(currentLang);

  ZOHO.embeddedApp.on("PageLoad", function (data) {
    log("🟢 Віджет завантажено");
    setTimeout(() => {
      loadHistory();
    }, 1500);
    dealId = data?.EntityId?.replace("Deals_", "") || null;
    if (!dealId) return log("❌ Не знайдено ID угоди");

    log(`📦 ID угоди: ${dealId}`);
    getExchangeRate();
  });

  ZOHO.embeddedApp.init();
  document.getElementById("update-btn").addEventListener("click", updateDealRate);
});

function getExchangeRate() {
  log("📤 Запит до НБУ...");
  fetch(nbuUrl)
    .then(res => res.json())
    .then(nbuData => {
      exchangeRateNBU = nbuData?.[0]?.rate || 0;
      document.getElementById("nbu-rate").textContent = exchangeRateNBU.toFixed(2);
      localStorage.setItem("last_nbu_rate", exchangeRateNBU);
      log(`Отримано курс НБУ: ${exchangeRateNBU}`);

      return ZOHO.CRM.API.getRecord({ Entity: "Deals", RecordID: dealId });
    })
    .then(response => {
      exchangeRateDeal = response?.data?.[0]?.[rateFieldAPIName] || 0;
      document.getElementById("deal-rate").textContent = exchangeRateDeal.toFixed(2);
      const diffPercent = ((exchangeRateDeal / exchangeRateNBU - 1) * 100).toFixed(1);
      document.getElementById("diff").textContent = `${diffPercent}%`;
      log(`📊 Різниця: ${diffPercent}%`);

      if (Math.abs(diffPercent) >= 5) {
        document.getElementById("update-btn").style.display = "inline-block";
      }
    })
    .catch(err => {
      log("Не вдалося отримати курс.");
    });
}

function updateDealRate() {
  log("Клік по кнопці оновлення");
  document.getElementById("update-btn").disabled = true;
  document.getElementById("status").textContent = "Оновлення...";

  const diffPercent = ((exchangeRateDeal / exchangeRateNBU - 1) * 100).toFixed(1);

  const config = {
    Entity: "Deals",
    APIData: {
      id: dealId,
      [rateFieldAPIName]: exchangeRateNBU
    },
    Trigger: ["workflow"]
  };

  ZOHO.CRM.API.updateRecord(config).then(response => {
    const result = response.data[0];
    if (result.code === "SUCCESS") {
      log("✅ Курс успішно оновлено в CRM");
      document.getElementById("status").textContent = "✅ Курс оновлено!";
      document.getElementById("deal-rate").textContent = exchangeRateNBU.toFixed(2);
      document.getElementById("diff").textContent = "0.0%";
      document.getElementById("update-btn").style.display = "none";
      createHistoryRecord(exchangeRateNBU, diffPercent);
    } else {
      document.getElementById("status").textContent = "⚠️ Помилка оновлення.";
    }
    document.getElementById("update-btn").disabled = false;
  });
}

function createHistoryRecord(rate, diffPercent) {
  const now = new Date();
  const payload = {
    
        Name: `New_${now.toLocaleDateString('uk-UA')} ${now.toLocaleTimeString('uk-UA')}`,
        Deal: {id: dealId},
        Rate: rate,
        Date: now.toISOString().split('T')[0],
        Rate_Source: "НБУ",
        Difference: parseFloat(diffPercent)
      
  };

  ZOHO.CRM.API.insertRecord({
    Entity: historyModule,
    APIData: payload,
    Trigger: ["workflow"]
  }).then(resp => {
    log("📥 Запис збережено в історії");
    setTimeout(() => {
      loadHistory();
    }, 1500);
  }).catch(err => {
    console.error("Помилка запису історії:", err);
    log("Помилка при збереженні історії курсу");
  });
}

function loadHistory() {
  ZOHO.CRM.API.searchRecord({
    Entity: "Exchange_Rate_History",
    Type: "criteria",
    Query: `(Deal:equals:${dealId})` 
  }).then(resp => {

      const data = resp?.data || [];
      const sorted = data.sort((a, b) => new Date(b.Date) - new Date(a.Date)).slice(0, 5);
      const tableBody = document.getElementById("history-table-body");
      tableBody.innerHTML = "";

      sorted.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${formatDate(item.Date)}</td>
          <td>${item.Rate?.toFixed(2) || '-'}</td>
          <td>${item.Difference?.toFixed(1) || '0.0'}%</td>
        `;
        tableBody.appendChild(tr);
      });
    })
    .catch(err => {
      log("Помилка завантаження історії");
      console.error(err);
    });
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
