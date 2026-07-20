(() => {
  "use strict";

  const bank = Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : [];
  const meta = window.QUESTION_BANK_META || {};
  const questionById = new Map(bank.map((question) => [question.id, question]));
  const STORAGE_KEY = "network-offline-quiz-v1";

  const byId = (id) => document.getElementById(id);
  const refs = {
    views: {
      setup: byId("setup-view"),
      quiz: byId("quiz-view"),
      result: byId("result-view"),
      book: byId("book-view"),
    },
    homeButton: byId("home-button"),
    wrongBookNav: byId("wrong-book-nav"),
    wrongBookCount: byId("wrong-book-count"),
    newPaperButton: byId("new-paper-button"),
    setupModeSelector: byId("setup-mode-selector"),
    randomSetupControls: byId("random-setup-controls"),
    chapterSetupControls: byId("chapter-setup-controls"),
    countSelector: byId("count-selector"),
    startButton: byId("start-button"),
    chapterSelector: byId("chapter-selector"),
    chapterStartButton: byId("chapter-start-button"),
    totalCount: byId("total-count"),
    singleCount: byId("single-count"),
    judgmentCount: byId("judgment-count"),
    imageCount: byId("image-count"),
    historyList: byId("history-list"),
    exitQuizButton: byId("exit-quiz-button"),
    progressLabel: byId("progress-label"),
    answeredLabel: byId("answered-label"),
    progressBar: byId("progress-bar"),
    liveScoreValue: byId("live-score-value"),
    navigatorSummary: byId("navigator-summary"),
    navigatorGrid: byId("navigator-grid"),
    questionType: byId("question-type"),
    questionChapter: byId("question-chapter"),
    questionStem: byId("question-stem"),
    questionImages: byId("question-images"),
    optionList: byId("option-list"),
    answerFeedback: byId("answer-feedback"),
    feedbackIcon: byId("feedback-icon"),
    feedbackTitle: byId("feedback-title"),
    correctAnswerLine: byId("correct-answer-line"),
    explanation: byId("explanation"),
    explanationText: byId("explanation-text"),
    explanationImages: byId("explanation-images"),
    previousButton: byId("previous-button"),
    nextButton: byId("next-button"),
    resultTitle: byId("result-title"),
    resultPercent: byId("result-percent"),
    resultFraction: byId("result-fraction"),
    resultCorrect: byId("result-correct"),
    resultWrong: byId("result-wrong"),
    resultTotal: byId("result-total"),
    retryWrongButton: byId("retry-wrong-button"),
    resultNewButton: byId("result-new-button"),
    reviewCount: byId("review-count"),
    reviewList: byId("review-list"),
    practiceBookButton: byId("practice-book-button"),
    clearBookButton: byId("clear-book-button"),
    bookList: byId("book-list"),
    confirmDialog: byId("confirm-dialog"),
    confirmTitle: byId("confirm-title"),
    confirmCopy: byId("confirm-copy"),
    confirmAction: byId("confirm-action"),
    liveRegion: byId("live-region"),
  };

  let selectedCount = 20;
  let setupMode = "random";
  let selectedChapterIndex = 0;
  let session = null;
  let pendingConfirmation = null;
  let saved = loadSavedData();

  function loadSavedData() {
    const fallback = { wrongIds: [], history: [] };
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || typeof parsed !== "object") return fallback;
      const wrongIds = Array.isArray(parsed.wrongIds)
        ? [...new Set(parsed.wrongIds.filter((id) => questionById.has(id)))]
        : [];
      const history = Array.isArray(parsed.history) ? parsed.history.slice(0, 8) : [];
      return { wrongIds, history };
    } catch (_error) {
      return fallback;
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (_error) {
      // The quiz remains usable when a browser blocks file-based storage.
    }
    updateWrongCount();
  }

  function updateWrongCount() {
    refs.wrongBookCount.textContent = String(saved.wrongIds.length);
  }

  function addWrongQuestion(id) {
    if (!saved.wrongIds.includes(id)) saved.wrongIds.unshift(id);
    saveData();
  }

  function removeWrongQuestion(id) {
    saved.wrongIds = saved.wrongIds.filter((wrongId) => wrongId !== id);
    saveData();
  }

  function shuffled(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function setView(name) {
    Object.entries(refs.views).forEach(([viewName, element]) => {
      element.hidden = viewName !== name;
    });
    refs.newPaperButton.hidden = name === "setup";
    document.body.dataset.view = name;
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function createEmptyState(message) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    return empty;
  }

  function renderSetup() {
    refs.totalCount.textContent = String(meta.total || bank.length);
    refs.singleCount.textContent = String(bank.filter((question) => question.type === "single").length);
    refs.judgmentCount.textContent = String(bank.filter((question) => question.type === "judgment").length);
    refs.imageCount.textContent = String(meta.imageCount || 0);
    renderChapterSelector();
    refs.historyList.replaceChildren();

    if (!saved.history.length) {
      refs.historyList.append(createEmptyState("暂无练习记录"));
      return;
    }

    saved.history.forEach((record) => {
      const row = document.createElement("div");
      row.className = "history-row";

      const mode = document.createElement("strong");
      if (record.mode === "wrong") {
        mode.textContent = "错题重练";
      } else if (record.mode === "chapter") {
        mode.textContent = record.label || "章节自测";
      } else {
        mode.textContent = `随机 ${record.total} 题`;
      }
      const score = document.createElement("span");
      score.textContent = `${record.correct} / ${record.total}`;
      const percent = document.createElement("strong");
      percent.textContent = `${Math.round((record.correct / record.total) * 100)}%`;
      const date = document.createElement("span");
      date.className = "history-date";
      date.textContent = new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(record.timestamp));

      row.append(mode, score, percent, date);
      refs.historyList.append(row);
    });
  }

  function availableChapters() {
    return Array.isArray(meta.chapters) && meta.chapters.length
      ? meta.chapters
      : [...new Set(bank.map((question) => question.chapter))];
  }

  function selectSetupMode(mode) {
    setupMode = mode;
    refs.setupModeSelector.querySelectorAll("button[data-mode]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
    refs.randomSetupControls.hidden = mode !== "random";
    refs.chapterSetupControls.hidden = mode !== "chapter";
  }

  function selectChapter(index) {
    const chapters = availableChapters();
    selectedChapterIndex = Math.max(0, Math.min(index, chapters.length - 1));
    refs.chapterSelector.querySelectorAll("button[data-chapter-index]").forEach((button) => {
      button.setAttribute(
        "aria-checked",
        String(Number(button.dataset.chapterIndex) === selectedChapterIndex),
      );
    });
  }

  function renderChapterSelector() {
    const chapters = availableChapters();
    if (selectedChapterIndex >= chapters.length) selectedChapterIndex = 0;
    refs.chapterSelector.replaceChildren();

    chapters.forEach((chapter, index) => {
      const count = bank.filter((question) => question.chapter === chapter).length;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.chapterIndex = String(index);
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(index === selectedChapterIndex));

      const name = document.createElement("span");
      name.textContent = chapter;
      const total = document.createElement("small");
      total.textContent = `${count} 题`;
      button.append(name, total);
      refs.chapterSelector.append(button);
    });
  }

  function selectCount(count) {
    selectedCount = count;
    refs.countSelector.querySelectorAll("button[data-count]").forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.count) === count));
    });
    refs.startButton.textContent = `开始 ${count} 题`;
  }

  function startRandomSession() {
    const questions = shuffled(bank).slice(0, Math.min(selectedCount, bank.length));
    startSession(questions, "random");
  }

  function startChapterSession() {
    const chapter = availableChapters()[selectedChapterIndex];
    const questions = bank.filter((question) => question.chapter === chapter);
    if (!questions.length) return;
    startSession(shuffled(questions), "chapter", chapter);
  }

  function startWrongSession(questions) {
    if (!questions.length) return;
    startSession(shuffled(questions), "wrong");
  }

  function startSession(questions, mode, label = "") {
    session = {
      questions,
      mode,
      label,
      currentIndex: 0,
      answers: new Map(),
      completed: false,
    };
    setView("quiz");
    renderQuestion();
  }

  function answerStats() {
    const responses = [...session.answers.values()];
    return {
      answered: responses.length,
      correct: responses.filter((response) => response.correct).length,
    };
  }

  function formatAnswer(question, key) {
    const option = question.options.find((item) => item.key === key);
    if (!option) return key || "未作答";
    return question.type === "single" ? `${option.key}. ${option.text}` : option.text;
  }

  function renderImages(container, sources, altText) {
    container.replaceChildren();
    sources.forEach((source, index) => {
      const image = document.createElement("img");
      image.src = source;
      image.alt = sources.length > 1 ? `${altText} ${index + 1}` : altText;
      image.loading = "eager";
      container.append(image);
    });
  }

  function renderNavigator() {
    refs.navigatorGrid.replaceChildren();
    session.questions.forEach((question, index) => {
      const response = session.answers.get(question.id);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(index + 1);
      button.setAttribute("aria-label", `第 ${index + 1} 题`);
      if (index === session.currentIndex) button.classList.add("current");
      if (response) button.classList.add(response.correct ? "correct" : "wrong");
      button.addEventListener("click", () => {
        session.currentIndex = index;
        renderQuestion();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      refs.navigatorGrid.append(button);
    });
  }

  function renderQuestion() {
    const question = session.questions[session.currentIndex];
    const response = session.answers.get(question.id);
    const stats = answerStats();
    const total = session.questions.length;

    refs.progressLabel.textContent = `${session.currentIndex + 1} / ${total}`;
    refs.answeredLabel.textContent = `已答 ${stats.answered} 题`;
    refs.progressBar.style.width = `${(stats.answered / total) * 100}%`;
    refs.liveScoreValue.textContent = String(stats.correct);
    refs.navigatorSummary.textContent = `${stats.answered} / ${total}`;
    refs.questionType.textContent = question.type === "single" ? "单选题" : "判断题";
    refs.questionChapter.textContent = question.chapter;
    refs.questionStem.textContent = question.stem;
    renderImages(refs.questionImages, question.questionImages, "题干图片");

    refs.optionList.replaceChildren();
    question.options.forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(response?.selected === option.key));
      button.disabled = Boolean(response);

      const key = document.createElement("span");
      key.className = "option-key";
      key.textContent = option.key;
      const text = document.createElement("span");
      text.className = "option-text";
      text.textContent = option.text;
      button.append(key, text);

      if (response) {
        if (option.key === question.answer) {
          button.classList.add("correct");
        } else if (option.key === response.selected) {
          button.classList.add("wrong");
        } else {
          button.classList.add("dimmed");
        }
      } else {
        button.addEventListener("click", () => answerCurrentQuestion(option.key));
      }
      refs.optionList.append(button);
    });

    renderFeedback(question, response);
    renderNavigator();

    refs.previousButton.disabled = session.currentIndex === 0;
    refs.nextButton.disabled = !response;
    if (stats.answered === total) {
      refs.nextButton.textContent = "查看成绩";
    } else if (session.currentIndex === total - 1) {
      refs.nextButton.textContent = "继续未答题";
    } else {
      refs.nextButton.textContent = "下一题";
    }
  }

  function renderFeedback(question, response) {
    refs.answerFeedback.hidden = !response;
    refs.answerFeedback.classList.toggle("is-wrong", Boolean(response && !response.correct));
    if (!response) return;

    refs.feedbackIcon.textContent = response.correct ? "✓" : "×";
    refs.feedbackTitle.textContent = response.correct ? "回答正确" : "回答错误";
    refs.correctAnswerLine.textContent = `正确答案：${formatAnswer(question, question.answer)}`;

    const hasExplanation = Boolean(question.explanation || question.explanationImages.length);
    refs.explanation.hidden = !hasExplanation;
    refs.explanationText.hidden = !question.explanation;
    refs.explanationText.textContent = question.explanation;
    renderImages(refs.explanationImages, question.explanationImages, "解析图片");
  }

  function answerCurrentQuestion(selected) {
    const question = session.questions[session.currentIndex];
    if (session.answers.has(question.id)) return;

    const correct = selected === question.answer;
    session.answers.set(question.id, { selected, correct });
    if (correct && session.mode === "wrong") {
      removeWrongQuestion(question.id);
    } else if (!correct) {
      addWrongQuestion(question.id);
    }

    refs.liveRegion.textContent = correct
      ? "回答正确"
      : `回答错误，正确答案是 ${question.answer}`;
    renderQuestion();
  }

  function goToPreviousQuestion() {
    if (session.currentIndex === 0) return;
    session.currentIndex -= 1;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToNextQuestion() {
    const current = session.questions[session.currentIndex];
    if (!session.answers.has(current.id)) return;

    const stats = answerStats();
    if (stats.answered === session.questions.length) {
      completeSession();
      return;
    }

    if (session.currentIndex < session.questions.length - 1) {
      session.currentIndex += 1;
    } else {
      session.currentIndex = session.questions.findIndex(
        (question) => !session.answers.has(question.id),
      );
    }
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function completeSession() {
    const stats = answerStats();
    if (!session.completed) {
      session.completed = true;
      saved.history.unshift({
        timestamp: Date.now(),
        total: session.questions.length,
        correct: stats.correct,
        mode: session.mode,
        label: session.label,
      });
      saved.history = saved.history.slice(0, 8);
      saveData();
    }
    renderResults();
    setView("result");
  }

  function renderResults() {
    const stats = answerStats();
    const total = session.questions.length;
    const wrongQuestions = session.questions.filter(
      (question) => !session.answers.get(question.id)?.correct,
    );

    refs.resultTitle.textContent = session.mode === "wrong"
      ? "错题重练完成"
      : session.mode === "chapter"
        ? "章节自测完成"
        : "练习完成";
    refs.resultPercent.textContent = `${Math.round((stats.correct / total) * 100)}%`;
    refs.resultFraction.textContent = `${stats.correct} / ${total}`;
    refs.resultCorrect.textContent = String(stats.correct);
    refs.resultWrong.textContent = String(total - stats.correct);
    refs.resultTotal.textContent = String(total);
    refs.reviewCount.textContent = `${wrongQuestions.length} 题`;
    refs.retryWrongButton.disabled = wrongQuestions.length === 0;
    renderReviewList(refs.reviewList, wrongQuestions, session.answers, "本次全部答对");
  }

  function renderReviewList(container, questions, responses, emptyMessage) {
    container.replaceChildren();
    if (!questions.length) {
      container.append(createEmptyState(emptyMessage));
      return;
    }

    questions.forEach((question, index) => {
      const response = responses?.get(question.id);
      const details = document.createElement("details");
      details.className = "review-item";
      const summary = document.createElement("summary");

      const number = document.createElement("span");
      number.className = "review-number";
      number.textContent = String(index + 1);
      const stem = document.createElement("span");
      stem.className = "review-stem";
      stem.textContent = question.stem;
      const toggle = document.createElement("span");
      toggle.className = "review-toggle";
      toggle.textContent = "›";
      toggle.setAttribute("aria-hidden", "true");
      summary.append(number, stem, toggle);

      const body = document.createElement("div");
      body.className = "review-body";
      const chapter = document.createElement("p");
      chapter.className = "review-chapter";
      chapter.textContent = question.chapter;
      body.append(chapter);

      if (question.questionImages.length) {
        const images = document.createElement("div");
        images.className = "review-images";
        renderImages(images, question.questionImages, "题干图片");
        body.append(images);
      }

      const options = document.createElement("div");
      options.className = "review-options";
      question.options.forEach((option) => {
        const optionLine = document.createElement("p");
        optionLine.textContent = question.type === "single" ? `${option.key}. ${option.text}` : option.text;
        options.append(optionLine);
      });
      body.append(options);

      const answers = document.createElement("div");
      answers.className = "review-answer";
      if (response) {
        const userAnswer = document.createElement("span");
        userAnswer.textContent = `你的答案：${formatAnswer(question, response.selected)}`;
        if (!response.correct) userAnswer.className = "user-wrong";
        answers.append(userAnswer);
      }
      const correctAnswer = document.createElement("strong");
      correctAnswer.textContent = `正确答案：${formatAnswer(question, question.answer)}`;
      answers.append(correctAnswer);
      body.append(answers);

      if (question.explanation || question.explanationImages.length) {
        const explanation = document.createElement("div");
        explanation.className = "review-explanation";
        if (question.explanation) {
          const heading = document.createElement("strong");
          heading.textContent = "答案解析";
          const copy = document.createElement("p");
          copy.textContent = question.explanation;
          explanation.append(heading, copy);
        }
        if (question.explanationImages.length) {
          const images = document.createElement("div");
          images.className = "review-images";
          renderImages(images, question.explanationImages, "解析图片");
          explanation.append(images);
        }
        body.append(explanation);
      }

      details.append(summary, body);
      container.append(details);
    });
  }

  function openWrongBook() {
    const questions = saved.wrongIds.map((id) => questionById.get(id)).filter(Boolean);
    refs.practiceBookButton.disabled = questions.length === 0;
    refs.clearBookButton.disabled = questions.length === 0;
    renderReviewList(refs.bookList, questions, null, "错题本为空");
    setView("book");
  }

  function goToSetup() {
    renderSetup();
    setView("setup");
  }

  function hasActiveSession() {
    return session && !session.completed;
  }

  function requestConfirmation({ title, copy, confirmLabel, action }) {
    pendingConfirmation = action;
    refs.confirmTitle.textContent = title;
    refs.confirmCopy.textContent = copy;
    refs.confirmAction.textContent = confirmLabel;
    if (typeof refs.confirmDialog.showModal === "function") {
      refs.confirmDialog.showModal();
    } else if (window.confirm(`${title}\n${copy}`)) {
      pendingConfirmation = null;
      action();
    }
  }

  function navigateAway(action) {
    if (!hasActiveSession()) {
      action();
      return;
    }
    requestConfirmation({
      title: "退出本次练习？",
      copy: "本次未完成的答题进度将不保留。",
      confirmLabel: "确认退出",
      action: () => {
        session = null;
        action();
      },
    });
  }

  refs.setupModeSelector.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (button) selectSetupMode(button.dataset.mode);
  });
  refs.countSelector.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-count]");
    if (button) selectCount(Number(button.dataset.count));
  });
  refs.chapterSelector.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-chapter-index]");
    if (button) selectChapter(Number(button.dataset.chapterIndex));
  });
  refs.startButton.addEventListener("click", startRandomSession);
  refs.chapterStartButton.addEventListener("click", startChapterSession);
  refs.previousButton.addEventListener("click", goToPreviousQuestion);
  refs.nextButton.addEventListener("click", goToNextQuestion);
  refs.exitQuizButton.addEventListener("click", () => navigateAway(goToSetup));
  refs.homeButton.addEventListener("click", () => navigateAway(goToSetup));
  refs.newPaperButton.addEventListener("click", () => navigateAway(goToSetup));
  refs.resultNewButton.addEventListener("click", goToSetup);
  refs.wrongBookNav.addEventListener("click", () => navigateAway(openWrongBook));
  refs.retryWrongButton.addEventListener("click", () => {
    const questions = session.questions.filter(
      (question) => !session.answers.get(question.id)?.correct,
    );
    startWrongSession(questions);
  });
  refs.practiceBookButton.addEventListener("click", () => {
    const questions = saved.wrongIds.map((id) => questionById.get(id)).filter(Boolean);
    startWrongSession(questions);
  });
  refs.clearBookButton.addEventListener("click", () => {
    requestConfirmation({
      title: "清空错题本？",
      copy: "已保存的错题记录将全部删除。",
      confirmLabel: "确认清空",
      action: () => {
        saved.wrongIds = [];
        saveData();
        openWrongBook();
      },
    });
  });
  refs.confirmDialog.addEventListener("close", () => {
    const action = pendingConfirmation;
    pendingConfirmation = null;
    if (refs.confirmDialog.returnValue === "confirm" && action) action();
  });

  if (!bank.length) {
    refs.views.setup.replaceChildren(createEmptyState("题库数据加载失败"));
    return;
  }

  selectCount(20);
  selectSetupMode(setupMode);
  updateWrongCount();
  renderSetup();
  setView("setup");
})();
