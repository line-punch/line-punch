const GAS_URL = "https://script.google.com/macros/s/AKfycbxi93T80nRUb5UH47kFfcfM9BMPmJP4IolinOFe5xdBkRUefkTFS7s-f6WxP3I0s98/exec";
const LIFF_ID = "2009482137-QgqJEHgA";

async function init() {
  try {
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    const idToken = liff.getIDToken();

    document.getElementById("app").innerHTML = `
      <h2>打卡系統</h2>
      <button onclick="clock('上班')">上班</button>
      <button onclick="clock('下班')">下班</button>
    `;

    window.clock = async function(type) {
      const res = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "clock",
          idToken,
          type
        })
      });

      const data = await res.json();
      alert(data.message);
    };

  } catch (e) {
    document.getElementById("app").innerHTML = "錯誤：" + e.message;
  }
}

init();
