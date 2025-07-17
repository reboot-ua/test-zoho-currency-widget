// app.js

let dealId = null;
let exchangeRateNBU = null;
let exchangeRateDeal = null;

const rateFieldAPIName = 'Currency_Rate'; // API-імʼя поля з курсом (заміни, якщо в тебе інше)
const nbuUrl = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json';

document.addEventListener('DOMContentLoaded', function () {
  ZOHO.embeddedApp.on("PageLoad", function (data) {
    dealId = data.EntityId;
    if (dealId.startsWith("Deals")) {
      dealId = dealId.split("_")[1]; // прибираємо "Deals_" з ID
    }

    getExchangeRate();
  });

  ZOHO.embeddedApp.init();

  document.getElementById("update-btn").addEventListener("click", updateDealRate);
});

function getExchangeRate() {
  // 1. Отримати курс НБУ
  fetch(nbuUrl)
    .then(response => response.json())
    .then(nbuData => {
      if (Array.isArray(nbuData) && nbuData.length > 0) {
        exchangeRateNBU = nbuData[0].rate;
        document.getElementById("nbu-rate").textContent = exchangeRateNBU.toFixed(2);

        // 2. Отримати угоду
        return ZOHO.CRM.API.getRecord({ Entity: "Deals", RecordID: dealId });
      } else {
        throw new Error("Неправильна відповідь НБУ");
      }
    })
    .then(nbuData => {
      exchangeRateNBU = nbuData[0].rate;
      document.getElementById("nbu-rate").textContent = exchangeRateNBU.toFixed(2);
    
      // 🔁 Замість запиту до Zoho, симулюй:
      const data = { Currency_Rate: 35.5 }; // наприклад
      exchangeRateDeal = data[rateFieldAPIName] || 0;
      document.getElementById("deal-rate").textContent = exchangeRateDeal.toFixed(2);
    
      const diffPercent = ((exchangeRateDeal / exchangeRateNBU - 1) * 100).toFixed(1);
      document.getElementById("diff").textContent = `${diffPercent}%`;
    
      if (Math.abs(diffPercent) >= 5) {
        document.getElementById("update-btn").style.display = "inline-block";
      }
    
    })
    .catch(err => {
      console.error("Помилка:", err);
      document.getElementById("status").textContent = "Не вдалося отримати курс.";
    });
}

function updateDealRate() {
  document.getElementById("update-btn").disabled = true;
  document.getElementById("status").textContent = "Оновлення...";

  const updatePayload = {
    data: [
      {
        id: dealId,
        [rateFieldAPIName]: exchangeRateNBU
      }
    ]
  };

  ZOHO.CRM.API.updateRecord({ Entity: "Deals", APIData: updatePayload })
    .then(response => {
      if (response.data[0].code === "SUCCESS") {
        document.getElementById("status").textContent = "Курс оновлено!";
        document.getElementById("update-btn").style.display = "none";
      } else {
        document.getElementById("status").textContent = "Помилка при оновленні.";
      }
    })
    .catch(err => {
      console.error("Помилка оновлення:", err);
      document.getElementById("status").textContent = "Помилка при оновленні.";
    });
}