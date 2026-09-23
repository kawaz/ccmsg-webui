// 各頁 (outer / inner) で同じ物を走らせる: 表示モードと origin を出し、押した物を記録する。
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const mode = document.getElementById("mode");
mode.textContent = standalone ? "standalone (PWA として開いている)" : "browser (PWA ではない。ホーム画面に追加してから開き直す)";
mode.classList.toggle("standalone", standalone);
document.getElementById("origin").textContent = location.origin;

const log = document.getElementById("log");
function note(text) {
  log.textContent = `${new Date().toLocaleTimeString()} ${text}\n${log.textContent}`;
}

for (const a of document.querySelectorAll("a")) {
  a.addEventListener("click", () => note(`${a.parentElement.textContent.trim().slice(0, 1)} pressed`));
}
for (const button of document.querySelectorAll("button[data-open]")) {
  button.addEventListener("click", () => {
    const label = button.parentElement.textContent.trim().slice(0, 1);
    const open = () => {
      const win = window.open("https://example.com/", "_blank", "noreferrer");
      note(`${label} window.open returned ${win === null ? "null (blocked)" : "a window"}`);
    };
    if (button.dataset.open === "async") setTimeout(open, 500);
    else open();
  });
}
