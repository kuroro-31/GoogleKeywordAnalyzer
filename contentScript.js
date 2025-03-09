// contentScript.js
(() => {
  // 検出状態を追跡
  let recaptchaDetected = false;
  let lastDetectionTime = 0;
  const detectionCooldown = 5000; // 5秒間のクールダウン

  // グローバル変数として定義
  let collectedResults = [];

  // 自然な検索行動をシミュレートする機能
  const naturalBehavior = {
    // ランダムな遅延を生成（ミリ秒）
    getRandomDelay(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    // ランダムな位置にスクロール
    randomScroll() {
      if (Math.random() > 0.7) {
        // 70%の確率でスクロール
        const scrollAmount = Math.floor(
          Math.random() * window.innerHeight * 0.8
        );
        window.scrollBy(0, scrollAmount);
      }
    },

    // ランダムなマウス移動をシミュレート
    simulateMouseMovement() {
      // 実際のマウス移動はできないが、イベントは発火できる
      if (Math.random() > 0.5) {
        // 50%の確率で実行
        const x = Math.floor(Math.random() * window.innerWidth);
        const y = Math.floor(Math.random() * window.innerHeight);

        const mouseEvent = new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        });

        document.dispatchEvent(mouseEvent);
      }
    },

    // 検索結果ページでランダムな要素にホバー
    hoverRandomSearchResult() {
      if (!window.location.href.includes("google.com/search")) return;

      const searchResults = document.querySelectorAll(".g");
      if (searchResults.length > 0) {
        const randomIndex = Math.floor(Math.random() * searchResults.length);
        const result = searchResults[randomIndex];

        if (result) {
          const mouseEvent = new MouseEvent("mouseover", {
            bubbles: true,
            cancelable: true,
          });

          result.dispatchEvent(mouseEvent);
        }
      }
    },

    // 自然な行動を実行（最小限に抑える）
    performNaturalBehavior() {
      // 各行動の間にランダムな遅延を入れる（最小限に抑える）
      setTimeout(() => this.randomScroll(), this.getRandomDelay(50, 100));
      setTimeout(
        () => this.simulateMouseMovement(),
        this.getRandomDelay(70, 150)
      );
      setTimeout(
        () => this.hoverRandomSearchResult(),
        this.getRandomDelay(90, 200)
      );
    },
  };

  // リキャプチャページの検出を強化
  function detectRecaptcha() {
    try {
      // 既に検出済みの場合は再検出しない
      if (recaptchaDetected) {
        return true;
      }

      // クールダウン期間中は検出処理をスキップ
      const now = Date.now();
      if (now - lastDetectionTime < detectionCooldown) {
        return false;
      }

      lastDetectionTime = now;

      // 通常のリキャプチャフレーム
      const recaptchaFrame = document.querySelector('iframe[src*="recaptcha"]');

      // リキャプチャ関連の要素
      const recaptchaElements = [
        "div.g-recaptcha",
        "#recaptcha",
        "#captcha-form",
        'form[action*="sorry"]',
        'div[id*="captcha"]',
        'div[class*="captcha"]',
        'iframe[src*="google.com/recaptcha"]',
        'iframe[title*="reCAPTCHA"]',
        'div[class*="recaptcha"]',
        'div[id*="recaptcha"]',
        'form[action*="accounts.google.com"]',
      ].some((selector) => document.querySelector(selector));

      // リキャプチャ関連のテキスト（より確実なものだけに絞る）
      const bodyText = document.body?.textContent?.toLowerCase() || "";
      const recaptchaTexts = [
        "通常と異なるトラフィックが検出されました",
        "セキュリティ チェック",
        "recaptcha による確認",
        "お使いのコンピュータ ネットワークから通常と異なるトラフィック",
        "自動送信された可能性があります",
        "ロボットではないことを確認",
        "一時的にブロック",
        "security challenge",
        "unusual traffic",
        "automated queries",
        "verify you are a human",
      ].some((text) => bodyText.includes(text.toLowerCase()));

      // Googleのsorryページの検出
      const isSorryPage =
        window.location.href.includes("/sorry/index") ||
        window.location.href.includes("google.com/sorry") ||
        window.location.href.includes("accounts.google.com/Captcha") ||
        window.location.href.includes("accounts.google.com/signin/challenge") ||
        (document.title.includes("Sorry") &&
          document.querySelector("form#captcha-form"));

      // 高度な検出パターン（誤検出を減らすために条件を厳しくする）
      const advancedDetection = () => {
        // 1. Google検索結果ページで結果が極端に少ない場合は検出しない
        // 正当な検索でも結果が少ないことがあるため

        // 2. ページ内にリキャプチャ関連のiframeが多数存在する場合
        const iframes = document.querySelectorAll("iframe");
        if (iframes.length > 3) {
          let recaptchaRelated = 0;
          for (const iframe of iframes) {
            const src = iframe.src || "";
            if (
              (src.includes("google") && src.includes("recaptcha")) ||
              src.includes("challenge")
            ) {
              recaptchaRelated++;
            }
          }
          if (recaptchaRelated >= 2) {
            return true;
          }
        }

        // 3. 特定のJavaScriptオブジェクトの存在をチェック
        if (window.___grecaptcha_cfg || window.grecaptcha) {
          return true;
        }

        // 4. HTTP応答コードが429または403の場合（タイトルに含まれる場合のみ）
        if (
          (document.title.includes("429") || document.title.includes("403")) &&
          document.body.textContent.includes("rate limit")
        ) {
          return true;
        }

        return false;
      };

      // 複数の条件が一致した場合のみリキャプチャと判定
      const isRecaptcha =
        (recaptchaFrame && (recaptchaElements || recaptchaTexts)) ||
        isSorryPage ||
        (advancedDetection() && (recaptchaElements || recaptchaTexts));

      if (isRecaptcha) {
        // 検出状態を設定
        recaptchaDetected = true;

        // 検出方法を特定
        const detectionMethod = [];
        if (recaptchaFrame) detectionMethod.push("frame");
        if (recaptchaElements) detectionMethod.push("elements");
        if (recaptchaTexts) detectionMethod.push("text");
        if (isSorryPage) detectionMethod.push("sorryPage");
        if (advancedDetection()) detectionMethod.push("advanced");

        // より詳細な情報を含めてメッセージを送信
        chrome.runtime.sendMessage({
          type: "RECAPTCHA_DETECTED",
          payload: {
            url: window.location.href,
            timestamp: new Date().toISOString(),
            // URLからキーワードを抽出する試み
            keyword:
              new URLSearchParams(window.location.search).get("q") || undefined,
            pageTitle: document.title,
            detectionMethod: detectionMethod.join(","),
            userAgent: navigator.userAgent,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            devicePixelRatio: window.devicePixelRatio,
            documentReferrer: document.referrer,
          },
        });

        // コンソールに記録
        console.log("リキャプチャを検出:", {
          url: window.location.href,
          method: detectionMethod.join(","),
          title: document.title,
        });

        return true;
      }
      return false;
    } catch (error) {
      console.error("リキャプチャ検出エラー:", error);
      return false;
    }
  }

  // アイコンとモーダルを追加する関数
  function addKeywordAnalyzerUI() {
    // すでに存在する場合は追加しない
    if (document.getElementById("keyword-analyzer-icon")) {
      return;
    }

    // アイコンを追加
    const icon = document.createElement("div");
    icon.id = "keyword-analyzer-icon";
    icon.textContent = "KA";
    icon.title = "キーワード分析ツール";
    document.body.appendChild(icon);

    // 保存された位置を読み込む
    chrome.storage.local.get(["iconPosition"], (result) => {
      if (result.iconPosition) {
        // 保存された位置を適用
        icon.style.top = result.iconPosition.top;
        icon.style.left = result.iconPosition.left;
        icon.style.right = result.iconPosition.right;
        icon.style.bottom = result.iconPosition.bottom;
      }
    });

    // ドラッグ機能を実装
    let isDragging = false;
    let offsetX, offsetY;

    // ドラッグ開始
    icon.addEventListener("mousedown", (e) => {
      // 左クリックのみ処理
      if (e.button !== 0) return;

      isDragging = true;
      icon.classList.add("dragging");

      // クリック位置とアイコンの位置の差分を計算
      const rect = icon.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      // デフォルトのドラッグ処理を防止
      e.preventDefault();
    });

    // ドラッグ中
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      // 新しい位置を計算
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;

      // 画面外に出ないように制限
      const maxX = window.innerWidth - icon.offsetWidth;
      const maxY = window.innerHeight - icon.offsetHeight;

      const newX = Math.max(0, Math.min(x, maxX));
      const newY = Math.max(0, Math.min(y, maxY));

      // 位置を設定
      icon.style.left = newX + "px";
      icon.style.top = newY + "px";
      icon.style.right = "auto";
      icon.style.bottom = "auto";

      e.preventDefault();
    });

    // ドラッグ終了
    document.addEventListener("mouseup", () => {
      if (!isDragging) return;

      isDragging = false;
      icon.classList.remove("dragging");

      // 位置をローカルストレージに保存
      const position = {
        top: icon.style.top,
        left: icon.style.left,
        right: icon.style.right,
        bottom: icon.style.bottom,
      };

      chrome.storage.local.set({ iconPosition: position });
    });

    // タッチデバイス用のイベント
    icon.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];

      isDragging = true;
      icon.classList.add("dragging");

      const rect = icon.getBoundingClientRect();
      offsetX = touch.clientX - rect.left;
      offsetY = touch.clientY - rect.top;

      e.preventDefault();
    });

    document.addEventListener("touchmove", (e) => {
      if (!isDragging) return;

      const touch = e.touches[0];

      const x = touch.clientX - offsetX;
      const y = touch.clientY - offsetY;

      const maxX = window.innerWidth - icon.offsetWidth;
      const maxY = window.innerHeight - icon.offsetHeight;

      const newX = Math.max(0, Math.min(x, maxX));
      const newY = Math.max(0, Math.min(y, maxY));

      icon.style.left = newX + "px";
      icon.style.top = newY + "px";
      icon.style.right = "auto";
      icon.style.bottom = "auto";

      e.preventDefault();
    });

    document.addEventListener("touchend", () => {
      if (!isDragging) return;

      isDragging = false;
      icon.classList.remove("dragging");

      const position = {
        top: icon.style.top,
        left: icon.style.left,
        right: icon.style.right,
        bottom: icon.style.bottom,
      };

      chrome.storage.local.set({ iconPosition: position });
    });

    // モーダルを追加
    const modal = document.createElement("div");
    modal.id = "keyword-analyzer-modal";
    document.body.appendChild(modal);

    // モーダルの内容を作成
    const modalContent = document.createElement("div");
    modalContent.id = "keyword-analyzer-modal-content";
    modal.appendChild(modalContent);

    // 閉じるボタンを追加
    const closeButton = document.createElement("div");
    closeButton.id = "keyword-analyzer-modal-close";
    closeButton.textContent = "×";
    closeButton.title = "閉じる";
    modal.appendChild(closeButton);

    // モーダルの内容を追加
    modalContent.innerHTML = `
      <h3>キーワード分析ツール</h3>
      <p>1行に1キーワードを入力</p>
      <textarea id="keywordInput"></textarea>
      <div class="button-group">
        <button id="startBtn">分析開始(Command+Enter)</button>
        <button id="clearKeywordsBtn">キーワードをクリア</button>
      </div>

      <div id="status"></div>
      <div id="results-container"></div>
      <div id="csv-preview"></div>
      <button id="copy-csv-btn">CSVをコピー</button>
      <button id="clear-results-btn">結果をクリア</button>
    `;

    // アイコンクリックでモーダルを表示（ドラッグ中は発火しないように）
    let dragStartTime = 0;
    icon.addEventListener("mousedown", () => {
      dragStartTime = Date.now();
    });

    icon.addEventListener("mouseup", (e) => {
      // クリック時間が短い場合のみモーダルを表示（ドラッグと区別）
      const dragEndTime = Date.now();
      if (dragEndTime - dragStartTime < 200) {
        modal.style.display = "flex";
        initializeModalFunctionality();
        e.stopPropagation();
      }
    });

    // 閉じるボタンクリックでモーダルを非表示
    closeButton.addEventListener("click", () => {
      modal.style.display = "none";
    });

    // モーダル外クリックでモーダルを非表示
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.display = "none";
      }
    });
  }

  // モーダルの機能を初期化する関数
  async function initializeModalFunctionality() {
    const keywordInput = document.getElementById("keywordInput");
    const startBtn = document.getElementById("startBtn");
    const clearKeywordsBtn = document.getElementById("clearKeywordsBtn");
    const statusEl = document.getElementById("status");
    const resultsContainer = document.getElementById("results-container");
    const csvPreview = document.getElementById("csv-preview");
    const copyCsvBtn = document.getElementById("copy-csv-btn");
    const clearResultsBtn = document.getElementById("clear-results-btn");

    // 初期状態で非表示にする
    csvPreview.style.display = "none";
    copyCsvBtn.style.display = "none";
    clearResultsBtn.style.display = "none";
    resultsContainer.style.display = "none";

    // 保存された結果とキーワードを復元
    const stored = await chrome.storage.local.get([
      "analysisResults",
      "savedKeywords",
    ]);

    if (stored.analysisResults && stored.analysisResults.length > 0) {
      // 結果がある場合は表示する
      resultsContainer.style.display = "block";
      csvPreview.style.display = "block";
      copyCsvBtn.style.display = "block";
      clearResultsBtn.style.display = "block";

      collectedResults = stored.analysisResults;
      updateCsvPreview(collectedResults);
    }

    if (stored.savedKeywords) {
      keywordInput.value = stored.savedKeywords;
    }

    // キーワード入力の変更を監視して保存
    keywordInput.addEventListener("input", () => {
      chrome.storage.local.set({ savedKeywords: keywordInput.value });
    });

    // キーワードクリアボタンの処理
    clearKeywordsBtn.addEventListener("click", () => {
      if (confirm("入力されたキーワードをクリアしますか？")) {
        keywordInput.value = "";
        chrome.storage.local.remove("savedKeywords");
      }
    });

    // 分析開始ボタンの処理
    startBtn.addEventListener("click", async () => {
      const rawText = keywordInput.value.trim();
      if (!rawText) {
        statusEl.textContent = "キーワードが入力されていません。";
        return;
      }

      // 入力されたキーワードを配列に変換
      let keywords = rawText
        .split("\n")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      if (keywords.length === 0) {
        statusEl.textContent = "有効なキーワードが見つかりません。";
        return;
      }

      // 既に分析済みのキーワードを取得
      const processedKeywords = collectedResults.map(
        (result) => result.Keyword
      );

      // 入力キーワードから既に分析済みのキーワードを除外
      const newKeywords = keywords.filter(
        (keyword) => !processedKeywords.includes(keyword)
      );

      // 除外されたキーワード（既に分析済み）
      const removedKeywords = keywords.filter((keyword) =>
        processedKeywords.includes(keyword)
      );

      if (newKeywords.length === 0) {
        statusEl.textContent = "すべてのキーワードが既に分析済みです。";
        return;
      }

      // 入力欄から分析済みのキーワードを削除
      if (removedKeywords.length > 0) {
        // 入力欄に残すキーワードのみを設定
        keywordInput.value = newKeywords.join("\n");

        // 削除されたキーワード数を通知
        const message = `${removedKeywords.length}件のキーワードが既に分析済みのため削除されました。`;
        statusEl.textContent = message;
        setTimeout(() => {
          statusEl.textContent = "分析を開始しています...";
        }, 2000);
      } else {
        statusEl.textContent = "分析を開始しています...";
      }

      // 重複を削除
      keywords = [...new Set(newKeywords)];

      // キーワードを保存
      chrome.storage.local.set({ savedKeywords: keywordInput.value });

      // バックグラウンドスクリプトに分析開始を通知
      chrome.runtime.sendMessage({
        type: "START_ANALYSIS",
        payload: {
          keywords: keywords,
        },
      });

      statusEl.style.display = "block";
    });

    // CSVコピーボタンの処理
    copyCsvBtn.addEventListener("click", () => {
      const csvText = convertToCSV(collectedResults);
      navigator.clipboard.writeText(csvText).then(
        () => {
          const originalText = copyCsvBtn.textContent;
          copyCsvBtn.textContent = "コピーしました！";
          setTimeout(() => {
            copyCsvBtn.textContent = originalText;
          }, 2000);
        },
        (err) => {
          console.error("クリップボードへのコピーに失敗しました", err);
        }
      );
    });

    // 結果クリアボタンの処理
    clearResultsBtn.addEventListener("click", () => {
      if (confirm("収集した結果をクリアしますか？")) {
        collectedResults = [];
        chrome.storage.local.remove("analysisResults");
        resultsContainer.innerHTML = "";
        csvPreview.innerHTML = "";
        csvPreview.style.display = "none";
        copyCsvBtn.style.display = "none";
        clearResultsBtn.style.display = "none";
      }
    });

    // Command+Enterでの分析開始
    keywordInput.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        startBtn.click();
      }
    });
  }

  // CSVに変換する関数（エクセル用にタブ区切り形式）
  function convertToCSV(results) {
    if (!results || results.length === 0) return "";

    // 表示する列の順序を指定（updateCsvPreview関数と同じ順序に合わせる）
    const orderedHeaders = [
      "Keyword",
      "allintitle件数",
      "intitle件数",
      "Q&A件数",
      "Q&A最高順位",
      "SNS件数",
      "SNS最高順位",
      "無料ブログ件数",
      "ブログ最高順位",
    ];

    // 存在する列のみをフィルタリング
    const availableHeaders = orderedHeaders.filter(
      (header) => results[0] && header in results[0]
    );

    // ヘッダー行を作成（タブ区切り）
    const headerRow = availableHeaders.join("\t");

    // データ行を作成（タブ区切り）
    const dataRows = results
      .map((row) => {
        return availableHeaders
          .map((header) => {
            // 列が存在しない場合は空文字列
            if (!(header in row)) return "";

            // nullや未定義の場合は空文字列に変換
            let value = row[header];
            if (value === null || value === undefined) {
              value = "";
            } else {
              // 文字列に変換
              value = String(value);
            }

            // タブを含む場合はスペースに置換
            value = value.replace(/\t/g, " ");

            // 改行を含む場合はスペースに置換
            value = value.replace(/\n/g, " ");

            return value;
          })
          .join("\t");
      })
      .join("\n");

    return `${headerRow}\n${dataRows}`;
  }

  // CSV形式で結果を表示する関数
  function updateCsvPreview(results) {
    const csvPreview = document.getElementById("csv-preview");
    if (!results || results.length === 0) {
      csvPreview.textContent = "結果がありません";
      return;
    }

    // 表示する列の順序を指定
    const orderedHeaders = [
      "Keyword",
      "allintitle件数",
      "intitle件数",
      "Q&A件数",
      "Q&A最高順位",
      "SNS件数",
      "SNS最高順位",
      "無料ブログ件数",
      "ブログ最高順位",
    ];

    // 各列の最大幅を計算
    const columnWidths = {};

    // ヘッダーの幅を初期値として設定
    orderedHeaders.forEach((header) => {
      columnWidths[header] = header.length;
    });

    // 各データの幅を確認して最大幅を更新
    results.forEach((row) => {
      orderedHeaders.forEach((header) => {
        // 列が存在しない場合はスキップ
        if (!(header in row)) return;

        let value = row[header];
        // nullや未定義の場合は空文字列に変換
        if (value === null || value === undefined) {
          value = "";
        } else {
          value = String(value);
        }
        // 値の長さが現在の最大幅より大きければ更新
        if (value.length > columnWidths[header]) {
          columnWidths[header] = value.length;
        }
      });
    });

    // 整形されたCSVを作成
    let formattedCSV = "";

    // ヘッダー行を整形
    formattedCSV +=
      orderedHeaders
        .map((header) => {
          return header.padEnd(columnWidths[header] + 2);
        })
        .join(" | ") + "\n";

    // 区切り線を追加
    formattedCSV +=
      orderedHeaders
        .map((header) => {
          return "-".repeat(columnWidths[header] + 2);
        })
        .join("-+-") + "\n";

    // データ行を整形（すべての行を表示）
    results.forEach((row) => {
      formattedCSV +=
        orderedHeaders
          .map((header) => {
            // 列が存在しない場合は空文字列
            if (!(header in row)) return "".padEnd(columnWidths[header] + 2);

            let value = row[header];
            // nullや未定義の場合は空文字列に変換
            if (value === null || value === undefined) {
              value = "";
            } else {
              value = String(value);
            }
            return value.padEnd(columnWidths[header] + 2);
          })
          .join(" | ") + "\n";
    });

    csvPreview.textContent = formattedCSV;
    csvPreview.style.fontFamily = "monospace";
    csvPreview.style.whiteSpace = "pre";
  }

  // エラーメッセージを表示する関数
  function showError(message) {
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.display = "block";
    }
  }

  // メッセージリスナーを設定
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "ANALYSIS_UPDATE") {
        const statusEl = document.getElementById("status");
        if (statusEl) {
          const { currentKeyword, progressText } = message.payload;
          statusEl.textContent = `${currentKeyword}\n${progressText}`;
        }
      } else if (message.type === "ANALYSIS_RESULT") {
        const csvPreview = document.getElementById("csv-preview");
        const copyCsvBtn = document.getElementById("copy-csv-btn");
        const clearResultsBtn = document.getElementById("clear-results-btn");
        const statusEl = document.getElementById("status");
        const resultsContainer = document.getElementById("results-container");

        if (csvPreview && copyCsvBtn && clearResultsBtn && statusEl) {
          // 結果表示要素を表示
          resultsContainer.style.display = "block";
          csvPreview.style.display = "block";
          copyCsvBtn.style.display = "block";
          clearResultsBtn.style.display = "block";

          const { keywordResult, progressInfo } = message.payload;
          collectedResults.push(keywordResult);

          // 結果を保存
          chrome.storage.local.set({
            analysisResults: collectedResults,
          });

          // CSV形式で結果を表示
          updateCsvPreview(collectedResults);

          // 進捗状況を更新
          statusEl.textContent = `処理完了: ${progressInfo.current}/${progressInfo.total}キーワード\n処理時間: ${progressInfo.processingTime}秒`;
        }
      } else if (message.type === "ANALYSIS_FINISHED") {
        const statusEl = document.getElementById("status");
        if (statusEl) {
          statusEl.textContent = "全キーワードの分析が完了しました。";
        }
      } else if (message.type === "RECAPTCHA_INTERRUPT") {
        const statusEl = document.getElementById("status");
        if (statusEl) {
          const { lastKeyword, currentCount, totalCount } = message.payload;
          statusEl.textContent = `⚠️ リキャプチャにより中断されました。\n処理済み: ${currentCount}/${totalCount}キーワード\n最後のキーワード: ${lastKeyword}`;
        }
      } else if (message.type === "ANALYSIS_ERROR") {
        const statusEl = document.getElementById("status");
        if (statusEl) {
          const { error, lastKeyword, currentCount, totalCount } =
            message.payload;
          statusEl.textContent = `⚠️ エラーが発生しました。\n${error}\n処理済み: ${currentCount}/${totalCount}キーワード\n最後のキーワード: ${lastKeyword}`;
        }
      } else if (message.type === "RECAPTCHA_DETECTED") {
        showError(message.message);
      }
    });
  }

  // 検索結果を解析する関数を修正
  function analyzeSearchResults() {
    try {
      // 検索結果ページでない場合は処理しない
      if (!window.location.href.includes("google.com/search")) {
        return null;
      }

      // 検索結果の総ヒット数を取得
      let totalHitCount = 0;
      const resultStats = document.getElementById("result-stats");
      if (resultStats) {
        const match = resultStats.textContent
          .replace(/\s/g, "")
          .match(/約?([\d,]+)/);
        if (match && match[1]) {
          totalHitCount = parseInt(match[1].replace(/,/g, ""), 10);
        }
      }

      // 各種カウンターの初期化
      let QA_count = 0;
      let QA_highestRank = null;
      let Blog_count = 0;
      let Blog_highestRank = null;
      let SNS_count = 0;
      let SNS_highestRank = null;
      let sns_details = {
        Tiktok: 0,
        Instagram: 0,
        X: 0,
        Facebook: 0,
        Youtube: 0,
        Twitch: 0,
      };

      // 検索結果の各アイテムを解析
      const searchItems = document.querySelectorAll("div.g");
      let rank = 1;

      // 処理を高速化するために、最大10件までの結果のみを解析
      const maxItemsToAnalyze = Math.min(searchItems.length, 10);

      for (let i = 0; i < maxItemsToAnalyze; i++) {
        const item = searchItems[i];
        const link = item.querySelector("a");
        if (!link || !link.href) continue;

        try {
          // URLの妥当性をチェック
          const url = new URL(link.href);
          const domain = url.hostname.toLowerCase();

          // Q&Aサイトのチェック
          if (
            domain.includes("yahoo") ||
            domain.includes("oshiete.goo") ||
            domain.includes("okwave") ||
            domain.includes("hatena") ||
            domain.includes("chiebukuro") ||
            domain.includes("quora") ||
            domain.includes("detail.chiebukuro")
          ) {
            QA_count++;
            if (QA_highestRank === null) {
              QA_highestRank = rank;
            }
          }

          // ブログサイトのチェック
          if (
            domain.includes("ameblo") ||
            domain.includes("livedoor.blog") ||
            domain.includes("fc2.com") ||
            domain.includes("hatena.ne.jp") ||
            domain.includes("seesaa.net") ||
            domain.includes("blog.jp") ||
            domain.includes("wordpress.com") ||
            domain.includes("note.com") ||
            domain.includes("naver.jp") ||
            domain.includes("goo.ne.jp/blog") ||
            domain.includes("rakuten.co.jp/blog") ||
            domain.includes("yaplog.jp") ||
            domain.includes("cocolog-nifty.com") ||
            domain.includes("blogspot.com") ||
            domain.includes("webnode.jp") ||
            domain.includes("hatenablog.com") ||
            domain.includes("hatenadiary.jp") ||
            domain.includes("livedoor.jp") ||
            domain.includes("muragon.com") ||
            domain.includes("bloggeek.jp") ||
            domain.includes("sonicblog.jp") ||
            domain.includes("publog.jp") ||
            domain.includes("at.webry.info") ||
            domain.includes("blog.with2.net") ||
            domain.includes("blog.goo.ne.jp") ||
            domain.includes("blog.livedoor.jp") ||
            domain.includes("blog.fc2.com") ||
            domain.includes("fanblogs.jp") ||
            domain.includes("jugem.jp") ||
            domain.includes("kitaguni.tv") ||
            domain.includes("ninja-blog.net") ||
            domain.includes("nomaki.jp") ||
            domain.includes("seesaa.jp") ||
            domain.includes("ti-da.net") ||
            domain.includes("webry.info") ||
            domain.includes("xrea.com") ||
            domain.includes("youblog.jp") ||
            domain.includes("doorblog.jp") ||
            domain.includes("dreamlog.jp") ||
            domain.includes("shinobi.jp") ||
            domain.includes("biz.nifty.com") ||
            domain.includes("blogism.jp") ||
            domain.includes("blogzine.jp") ||
            domain.includes("cocolog-tcom.com") ||
            domain.includes("gger.jp") ||
            domain.includes("golog.jp") ||
            domain.includes("jp.bloguru.com") ||
            domain.includes("jugem.cc") ||
            domain.includes("naturum.ne.jp") ||
            domain.includes("netpro.ne.jp") ||
            domain.includes("plaza.rakuten.co.jp") ||
            domain.includes("shinobi.jp") ||
            domain.includes("so-net.ne.jp") ||
            domain.includes("teacup.com") ||
            domain.includes("weblog.to") ||
            domain.includes("yomi.mobi") ||
            domain.includes("zenlog.jp")
          ) {
            Blog_count++;
            if (Blog_highestRank === null) {
              Blog_highestRank = rank;
            }
          }

          // SNSサイトのチェック
          if (
            domain.includes("twitter.com") ||
            domain.includes("x.com") ||
            domain.includes("facebook.com") ||
            domain.includes("instagram.com") ||
            domain.includes("tiktok.com") ||
            domain.includes("youtube.com") ||
            domain.includes("youtu.be") ||
            domain.includes("linkedin.com") ||
            domain.includes("pinterest.com") ||
            domain.includes("reddit.com") ||
            domain.includes("tumblr.com") ||
            domain.includes("twitch.tv") ||
            domain.includes("snapchat.com") ||
            domain.includes("threads.net") ||
            domain.includes("line.me")
          ) {
            SNS_count++;
            if (SNS_highestRank === null) {
              SNS_highestRank = rank;
            }

            // SNSの詳細カウント
            if (domain.includes("tiktok.com")) {
              sns_details.Tiktok++;
            } else if (domain.includes("instagram.com")) {
              sns_details.Instagram++;
            } else if (
              domain.includes("twitter.com") ||
              domain.includes("x.com")
            ) {
              sns_details.X++;
            } else if (domain.includes("facebook.com")) {
              sns_details.Facebook++;
            } else if (
              domain.includes("youtube.com") ||
              domain.includes("youtu.be")
            ) {
              sns_details.Youtube++;
            } else if (domain.includes("twitch.tv")) {
              sns_details.Twitch++;
            }
          }

          rank++;
        } catch (error) {
          console.error("URL解析エラー:", error);
          continue;
        }
      }

      // 結果をまとめる
      const results = {
        totalHitCount,
        QA_count,
        QA_highestRank,
        Blog_count,
        Blog_highestRank,
        SNS_count,
        SNS_highestRank,
        sns_details,
      };

      // 結果をbackground.jsに送信
      chrome.runtime.sendMessage({
        type: "DOM_PARSED",
        payload: results,
      });

      return results;
    } catch (error) {
      console.error("検索結果解析エラー:", error);
      // エラーが発生した場合でも結果を送信
      chrome.runtime.sendMessage({
        type: "DOM_PARSED",
        payload: {
          totalHitCount: 0,
          QA_count: 0,
          QA_highestRank: null,
          Blog_count: 0,
          Blog_highestRank: null,
          SNS_count: 0,
          SNS_highestRank: null,
          sns_details: {
            Tiktok: 0,
            Instagram: 0,
            X: 0,
            Facebook: 0,
            Youtube: 0,
            Twitch: 0,
          },
          error: error.message,
        },
      });
      return null;
    }
  }

  // メイン処理
  function main() {
    // Google検索結果ページかどうかを確認
    const isGoogleSearch = window.location.href.includes("google.com/search");

    // リキャプチャの検出
    const isRecaptcha = detectRecaptcha();

    // リキャプチャが検出されなかった場合のみ処理を続行
    if (!isRecaptcha) {
      // 自然な行動をシミュレート（最小限）
      naturalBehavior.performNaturalBehavior();

      // Google検索結果ページの場合は分析を実行
      if (isGoogleSearch) {
        // 少し遅延を入れて自然な動きをシミュレート（さらに短縮）
        setTimeout(() => {
          analyzeSearchResults();
        }, naturalBehavior.getRandomDelay(50, 100));
      }
    }

    // アイコンとモーダルを追加
    addKeywordAnalyzerUI();

    // メッセージリスナーを設定
    setupMessageListener();
  }

  // ページ読み込み完了時に実行
  if (document.readyState === "complete") {
    main();
  } else {
    window.addEventListener("load", main);
  }

  // スクロールイベントでもリキャプチャ検出を実行（スロットリング付き）
  let lastScrollCheck = 0;
  window.addEventListener("scroll", () => {
    const now = Date.now();
    if (now - lastScrollCheck > 2000) {
      // 2秒ごとにチェック
      lastScrollCheck = now;
      detectRecaptcha();
    }
  });

  // DOMの変更を監視
  const observer = new MutationObserver((mutations) => {
    // 変更があった場合にリキャプチャ検出を実行
    detectRecaptcha();
  });

  // body要素が存在する場合のみ監視を開始
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: false,
      attributeFilter: ["class", "id", "src"],
    });
  }

  chrome.runtime.onMessage.addListener(function (
    request,
    sender,
    sendResponse
  ) {
    if (request.action === "startSolving") {
      startSolving();
    }
  });

  function startSolving() {
    solve();
  }

  // 検索キーワードを入力して検索を実行する関数を追加
  function executeSearch(keyword) {
    // 検索フォームを取得
    const searchInput = document.querySelector('textarea[name="q"]');
    const searchForm = document.querySelector("form");

    if (searchInput && searchForm) {
      // 検索キーワードを設定
      searchInput.value = keyword;

      // フォームをサブミット
      searchForm.submit();
    }
  }

  // メッセージリスナーを追加（重複を避けるため、変数に保存）
  const messageListener = (message, sender, sendResponse) => {
    if (message.type === "RECAPTCHA_DETECTED") {
      // 既に通知が表示されている場合は何もしない
      if (document.querySelector(".recaptcha-notification")) {
        return;
      }

      console.log("リキャプチャ検出メッセージを受信:", message);

      // ページ上に通知を表示
      const notificationDiv = document.createElement("div");
      notificationDiv.className = "recaptcha-notification";
      notificationDiv.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background-color: #f44336;
        color: white;
        padding: 15px;
        border-radius: 5px;
        z-index: 9999;
        font-family: Arial, sans-serif;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      `;
      notificationDiv.textContent =
        "リキャプチャが検出されました。手動での対応が必要です。";
      document.body.appendChild(notificationDiv);

      // 5秒後に通知を消す
      setTimeout(() => {
        if (notificationDiv.parentNode) {
          notificationDiv.parentNode.removeChild(notificationDiv);
        }
      }, 5000);
    }
  };

  // 既存のリスナーを削除してから追加
  chrome.runtime.onMessage.removeListener(messageListener);
  chrome.runtime.onMessage.addListener(messageListener);
})();
