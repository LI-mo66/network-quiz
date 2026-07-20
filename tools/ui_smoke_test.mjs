import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";


const here = dirname(fileURLToPath(import.meta.url));
const appUrl = pathToFileURL(join(here, "..", "index.html")).href;
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profilePath = mkdtempSync(join(tmpdir(), "offline-quiz-chrome-"));
const outputPath = join(tmpdir(), "codex-offline-quiz-screens");
const port = 9300 + Math.floor(Math.random() * 400);
mkdirSync(outputPath, { recursive: true });

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    "--allow-file-access-from-files",
    `--user-data-dir=${profilePath}`,
    `--remote-debugging-port=${port}`,
    "--window-size=1440,1000",
    appUrl,
  ],
  { stdio: "ignore", windowsHide: true },
);

let socket;
let commandId = 0;
const pending = new Map();

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForPage() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((entry) => entry.type === "page");
      if (page) return page;
    } catch (_error) {
      // Chrome may need a moment to expose its debugging endpoint.
    }
    await delay(100);
  }
  throw new Error("Chrome debugging endpoint did not become ready");
}

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "Page evaluation failed");
  }
  return response.result.value;
}

async function waitFor(expression, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(expression)) return;
    await delay(50);
  }
  throw new Error(message);
}

async function screenshot(name) {
  const response = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  writeFileSync(join(outputPath, name), Buffer.from(response.data, "base64"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function reloadAndWait() {
  await send("Page.reload", { ignoreCache: true });
  await waitFor(
    "Boolean(document.getElementById('setup-view') && !document.getElementById('setup-view').hidden && window.QUESTION_BANK?.length === 100)",
    "Setup view did not load",
  );
}

async function chooseCurrentAnswer(wrong = false) {
  return evaluate(`(() => {
    const stem = document.getElementById('question-stem').textContent;
    const question = window.QUESTION_BANK.find((item) => item.stem === stem);
    const buttons = [...document.querySelectorAll('#option-list .option-button')];
    const target = buttons.find((button) => {
      const key = button.querySelector('.option-key').textContent;
      return ${wrong} ? key !== question.answer : key === question.answer;
    });
    target.click();
    return {
      feedbackVisible: !document.getElementById('answer-feedback').hidden,
      markedWrong: document.getElementById('answer-feedback').classList.contains('is-wrong'),
      wrongCount: document.getElementById('wrong-book-count').textContent,
    };
  })()`);
}

try {
  const page = await waitForPage();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const handlers = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message));
    else handlers.resolve(message.result);
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await waitFor(
    "Boolean(document.getElementById('setup-view') && !document.getElementById('setup-view').hidden && window.QUESTION_BANK?.length === 100)",
    "Initial setup view did not load",
  );
  assert((await evaluate("document.getElementById('total-count').textContent")) === "100", "Wrong bank total");
  await screenshot("desktop-setup.png");

  await evaluate("document.querySelector('[data-count=\"20\"]').click(); document.getElementById('start-button').click()");
  await waitFor("!document.getElementById('quiz-view').hidden", "Quiz view did not open");

  for (let index = 0; index < 20; index += 1) {
    const result = await chooseCurrentAnswer(index === 0);
    assert(result.feedbackVisible, `Immediate feedback missing at question ${index + 1}`);
    if (index === 0) {
      assert(result.markedWrong, "Deliberately wrong answer was not marked wrong");
      assert(result.wrongCount === "1", "Wrong question was not saved");
      await screenshot("desktop-feedback.png");
    }
    await evaluate("document.getElementById('next-button').click()");
  }

  await waitFor("!document.getElementById('result-view').hidden", "Result view did not open");
  assert(
    (await evaluate("document.getElementById('result-fraction').textContent")) === "19 / 20",
    "Unexpected final score",
  );
  assert(
    (await evaluate("document.querySelectorAll('#review-list .review-item').length")) === 1,
    "Wrong-answer review was not rendered",
  );
  await screenshot("desktop-result.png");

  await evaluate("document.getElementById('retry-wrong-button').click()");
  const retryResult = await chooseCurrentAnswer(false);
  assert(retryResult.wrongCount === "0", "Correct retry did not clear the wrong-question record");
  await evaluate("document.getElementById('next-button').click()");
  await waitFor("!document.getElementById('result-view').hidden", "Retry result view did not open");
  assert(
    (await evaluate("document.getElementById('result-percent').textContent")) === "100%",
    "Unexpected retry score",
  );

  await reloadAndWait();
  await evaluate("document.getElementById('start-button').click()");
  await chooseCurrentAnswer(true);
  await evaluate("document.getElementById('wrong-book-nav').click()");
  await waitFor("document.getElementById('confirm-dialog').open", "Leave confirmation did not open");
  await evaluate("document.getElementById('confirm-action').click()");
  await waitFor("!document.getElementById('book-view').hidden", "Wrong book did not open");
  assert(
    (await evaluate("document.querySelectorAll('#book-list .review-item').length")) === 1,
    "Wrong book did not contain the saved question",
  );
  await evaluate("document.getElementById('practice-book-button').click()");
  await chooseCurrentAnswer(false);
  await evaluate("document.getElementById('next-button').click()");
  await waitFor("!document.getElementById('result-view').hidden", "Wrong-book practice did not finish");

  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await reloadAndWait();
  const mobileSetupWidth = await evaluate("({scroll: document.documentElement.scrollWidth, viewport: innerWidth})");
  assert(mobileSetupWidth.scroll <= mobileSetupWidth.viewport, "Mobile setup has horizontal overflow");
  await screenshot("mobile-setup.png");
  await evaluate("document.getElementById('start-button').click()");
  await waitFor("!document.getElementById('quiz-view').hidden", "Mobile quiz did not open");
  const mobileQuizWidth = await evaluate("({scroll: document.documentElement.scrollWidth, viewport: innerWidth})");
  assert(mobileQuizWidth.scroll <= mobileQuizWidth.viewport, "Mobile quiz has horizontal overflow");
  await screenshot("mobile-quiz.png");

  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await reloadAndWait();
  await evaluate("document.querySelector('[data-count=\"100\"]').click(); document.getElementById('start-button').click()");
  let imageFound = false;
  for (let index = 0; index < 100; index += 1) {
    imageFound = await evaluate(`(() => {
      document.querySelectorAll('#navigator-grid button')[${index}].click();
      return Boolean(document.querySelector('#question-images img'));
    })()`);
    if (imageFound) break;
  }
  assert(imageFound, "No question image rendered in the 100-question paper");
  await waitFor(
    "document.querySelector('#question-images img').complete && document.querySelector('#question-images img').naturalWidth > 0",
    "Question image failed to load",
  );
  await screenshot("desktop-image-question.png");

  let explanationImageFound = false;
  for (let index = 0; index < 100; index += 1) {
    explanationImageFound = await evaluate(`(() => {
      document.querySelectorAll('#navigator-grid button')[${index}].click();
      const stem = document.getElementById('question-stem').textContent;
      const question = window.QUESTION_BANK.find((item) => item.stem === stem);
      if (!question.explanationImages.length) return false;
      const buttons = [...document.querySelectorAll('#option-list .option-button')];
      buttons.find((button) => button.querySelector('.option-key').textContent === question.answer).click();
      return true;
    })()`);
    if (explanationImageFound) break;
  }
  assert(explanationImageFound, "No explanation image question was found");
  await waitFor(
    "!document.getElementById('explanation').hidden && document.querySelector('#explanation-images img').complete && document.querySelector('#explanation-images img').naturalWidth > 0",
    "Explanation image failed to load after answering",
  );
  await screenshot("desktop-explanation-image.png");

  console.log("PASS");
  console.log(outputPath);
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  chrome.kill();
  await delay(150);
  rmSync(profilePath, { recursive: true, force: true });
}
