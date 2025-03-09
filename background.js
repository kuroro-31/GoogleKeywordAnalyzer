// background.js

// 分析対象のキーワードリスト
let keywordQueue = [];
let currentIndex = 0;

// ランダムなユーザーエージェントのリスト
const USER_AGENTS = [
  // macOS Chrome
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
  // macOS Safari
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  // macOS Firefox
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:119.0) Gecko/20100101 Firefox/119.0",
  // Windows Chrome
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  // Windows Edge
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
  // Windows Firefox
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0",
];

// ランダムなユーザーエージェントを取得
function getRandomUserAgent() {
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[index];
}

// ランダムな待機時間を生成（自然な検索パターンをシミュレート）
function getRandomWaitTime(min, max) {
  // 基本の待機時間
  const baseTime = Math.floor(Math.random() * (max - min + 1)) + min;

  // 自然なばらつきを追加（±20%）
  const variation = baseTime * 0.2 * (Math.random() * 2 - 1);

  return Math.max(min, Math.floor(baseTime + variation));
}

// Googleドメインの全Cookieを削除する関数
async function clearGoogleCookies() {
  try {
    // Google関連のドメインのCookieを削除
    const googleDomains = ["google.com", "www.google.com"];

    for (const domain of googleDomains) {
      const cookies = await chrome.cookies.getAll({ domain });

      for (const cookie of cookies) {
        try {
          const url = `http${cookie.secure ? "s" : ""}://${cookie.domain}${
            cookie.path
          }`;
          await chrome.cookies.remove({
            url: url,
            name: cookie.name,
          });
        } catch (e) {
          console.log(`Cookie削除スキップ: ${cookie.name}`, e);
          // エラーを無視して続行
        }
      }
    }

    console.log("Googleのクッキーを削除しました");
  } catch (error) {
    console.error("クッキー削除エラー:", error);
    // エラーを無視して続行
  }
}

// キーワードを順番に処理するフロー
async function processKeywords(keywords) {
  // 保存された結果を取得して、処理済みのキーワードを特定
  const stored = await chrome.storage.local.get("analysisResults");
  const processedKeywords = new Set(
    (stored.analysisResults || []).map((result) => result.Keyword)
  );

  // 未処理のキーワードのみをフィルタリング
  const remainingKeywords = keywords.filter(
    (keyword) => !processedKeywords.has(keyword)
  );

  // キーワードをランダムな順序で処理するためにシャッフル
  const shuffledKeywords = [...remainingKeywords];
  for (let i = shuffledKeywords.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledKeywords[i], shuffledKeywords[j]] = [
      shuffledKeywords[j],
      shuffledKeywords[i],
    ];
  }

  const chunks = [];
  for (let i = 0; i < shuffledKeywords.length; i += 5) {
    chunks.push(shuffledKeywords.slice(i, i + 5));
  }

  const totalKeywords = keywords.length;
  let processedCount = processedKeywords.size;

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        // インターバル待機中のメッセージを表示
        const waitTime = getRandomWaitTime(3, 10); // 3〜10秒のランダムな待機時間（短縮）
        for (let remaining = waitTime; remaining > 0; remaining--) {
          chrome.runtime.sendMessage({
            type: "ANALYSIS_UPDATE",
            payload: {
              currentKeyword: "インターバル待機中",
              progressText: `次のバッチまで残り${remaining}秒 (${processedCount}/${totalKeywords}キーワード完了)`,
            },
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      try {
        processedCount = await searchKeywords(
          chunks[i],
          processedCount,
          totalKeywords
        );
      } catch (error) {
        // エラーが発生した場合は処理を中断
        console.error("検索処理エラー:", error);

        // エラー通知を送信
        chrome.runtime.sendMessage({
          type: "ANALYSIS_ERROR",
          payload: {
            error: error.message,
            lastKeyword: chunks[i][0],
            currentCount: processedCount,
            totalCount: totalKeywords,
          },
        });

        // エラー通知を表示
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: "エラーが発生しました",
          message: `処理中にエラーが発生しました: ${error.message}`,
        });

        // 処理を中断
        return;
      }
    }

    // 全ての処理が完了したら完了メッセージを送信
    chrome.runtime.sendMessage({
      type: "ANALYSIS_FINISHED",
    });

    // 完了通知を表示
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "キーワード分析が完了しました",
      message: `${totalKeywords}件のキーワードの分析が完了しました。`,
    });
  } catch (error) {
    console.error("処理エラー:", error);
    // 上位のエラーハンドリングも追加
    chrome.runtime.sendMessage({
      type: "ANALYSIS_ERROR",
      payload: {
        error: error.message,
        currentCount: processedCount,
        totalCount: totalKeywords,
      },
    });
  }
}

// 検索結果を解析する関数を削除（contentScript.jsに移動）
// searchKeywords関数を修正
async function searchKeywords(keywordChunk, processedCount, totalKeywords) {
  console.log("検索開始:", keywordChunk);
  let localProcessedCount = processedCount;

  for (const keyword of keywordChunk) {
    try {
      console.log("現在の検索キーワード:", keyword);

      // searchSingleKeywordの結果を待つ
      const result = await searchSingleKeyword(
        keyword,
        localProcessedCount,
        totalKeywords
      );

      // 結果を保存
      const stored = await chrome.storage.local.get("analysisResults");
      const results = stored.analysisResults || [];
      results.push(result);
      await chrome.storage.local.set({ analysisResults: results });

      // 結果をコンテンツスクリプトに通知
      chrome.runtime.sendMessage({
        type: "ANALYSIS_RESULT",
        payload: {
          keywordResult: result,
          progressInfo: {
            current: localProcessedCount + 1,
            total: totalKeywords,
            processingTime: result.処理時間,
          },
        },
      });

      // キーワードが処理されたことを通知
      chrome.runtime.sendMessage({
        type: "KEYWORD_REMOVED",
        payload: {
          processedKeyword: keyword,
        },
      });

      // カウンターをインクリメント
      localProcessedCount++;

      // 次のキーワードの前に待機時間を設定
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("検索エラー:", error);

      if (error.message === "RECAPTCHA_DETECTED") {
        // リキャプチャ検出時の処理を改善
        await handleRecaptchaError(
          keyword,
          localProcessedCount,
          totalKeywords,
          error.url || "URL不明"
        );

        // 現在までの結果を保存
        chrome.runtime.sendMessage({
          type: "SAVE_PARTIAL_RESULTS",
          payload: {
            lastKeyword: keyword,
            processedCount: localProcessedCount,
          },
        });

        // エラーを投げる前に一時停止
        await new Promise((resolve) => setTimeout(resolve, 5000));
        throw error;
      }
      // その他のエラーの場合も上位に伝播
      throw error;
    }
  }
  return localProcessedCount;
}

// searchSingleKeyword関数を修正
async function searchSingleKeyword(keyword, processedCount, totalKeywords) {
  try {
    // 検索前にGoogleのCookieを削除
    await clearGoogleCookies();

    // 進捗状況を更新
    chrome.runtime.sendMessage({
      type: "ANALYSIS_UPDATE",
      payload: {
        currentKeyword: keyword,
        progressText: `処理中... (${processedCount}/${totalKeywords}キーワード完了)`,
      },
    });

    const startTime = Date.now();

    // 検索URLを構築
    const normalUrl = `https://www.google.com/search?q=${encodeURIComponent(
      keyword
    )}`;
    const intitleUrl = `https://www.google.com/search?q=intitle:${encodeURIComponent(
      keyword
    )}`;
    const allintitleUrl = `https://www.google.com/search?q=allintitle:${encodeURIComponent(
      keyword
    )}`;

    // 現在のタブを取得
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // --- 1. 通常の検索 ---
    await chrome.tabs.update(tab.id, { url: normalUrl });
    let normalResults = await waitForSearchResults(tab.id);

    // 各検索の間に十分な待機時間を設定
    await new Promise((resolve) => setTimeout(resolve, 50));

    // --- 2. intitle検索 ---
    await chrome.tabs.update(tab.id, { url: intitleUrl });
    let intitleResults = await waitForSearchResults(tab.id);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // --- 3. allintitle検索 ---
    await chrome.tabs.update(tab.id, { url: allintitleUrl });
    let allintitleResults = await waitForSearchResults(tab.id);

    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(1);

    return {
      Keyword: keyword || "",
      allintitle件数: allintitleResults?.totalHitCount || 0,
      intitle件数: intitleResults?.totalHitCount || 0,
      "Q&A件数": normalResults?.QA_count || 0,
      "Q&A最高順位": normalResults?.QA_highestRank || null,
      無料ブログ件数: normalResults?.Blog_count || 0,
      ブログ最高順位: normalResults?.Blog_highestRank || null,
      SNS件数: normalResults?.SNS_count || 0,
      SNS最高順位: normalResults?.SNS_highestRank || null,
      sns_details: normalResults?.sns_details || {},
      処理時間: `${processingTime}秒`,
    };
  } catch (error) {
    console.error("検索エラー:", error);
    throw error;
  }
}

// 検索結果を待機する関数
function waitForSearchResults(tabId) {
  return new Promise((resolve, reject) => {
    const onMessageListener = (message, sender) => {
      if (sender.tab.id === tabId) {
        if (message.type === "DOM_PARSED") {
          chrome.runtime.onMessage.removeListener(onMessageListener);
          resolve(message.payload);
        } else if (message.type === "RECAPTCHA_DETECTED") {
          chrome.runtime.onMessage.removeListener(onMessageListener);
          reject(new Error("RECAPTCHA_DETECTED"));
        }
      }
    };

    chrome.runtime.onMessage.addListener(onMessageListener);

    // タイムアウト設定
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onMessageListener);
      reject(new Error("TIMEOUT"));
    }, 15000); // 15秒に短縮
  });
}

// リキャプチャ検出時などのログ関数
function logMessage(
  message,
  keyword = "",
  processedCount = 0,
  totalKeywords = 0,
  errorUrl = ""
) {
  console.log("ログ:", {
    message,
    keyword,
    processedCount,
    totalKeywords,
    errorUrl,
  });
}

// Google検索URLを開き、contentScriptからDOM解析結果を受け取る
function getSearchResults(searchUrl, keyword, processedCount, totalKeywords) {
  return new Promise((resolve, reject) => {
    let isResolved = false;

    // 新しいウィンドウを作成
    chrome.windows.create(
      {
        url: searchUrl,
        type: "normal",
        focused: false,
        width: 1000,
        height: 800,
        top: 100,
        left: 100,
        incognito: false,
      },
      (window) => {
        const tabId = window.tabs[0].id;

        const onMessageListener = (message, sender, sendResponse) => {
          if (isResolved) return;
          if (message.type === "DOM_PARSED" && sender.tab.id === tabId) {
            isResolved = true;
            let data = message.payload;
            // ウィンドウを閉じる
            chrome.windows.remove(window.id);
            chrome.runtime.onMessage.removeListener(onMessageListener);
            resolve(data);
          } else if (
            message.type === "RECAPTCHA_DETECTED" &&
            sender.tab.id === tabId
          ) {
            isResolved = true;
            chrome.runtime.onMessage.removeListener(onMessageListener);
            // リキャプチャが検出された場合はウィンドウを閉じない（手動で解決できるように）
            reject(new Error("RECAPTCHA_DETECTED"));
          }
        };

        chrome.runtime.onMessage.addListener(onMessageListener);

        // タブの更新イベントを監視
        chrome.tabs.onUpdated.addListener(function onUpdated(
          updatedTabId,
          changeInfo
        ) {
          if (updatedTabId === tabId && changeInfo.status === "complete") {
            // 一定時間後にタイムアウト
            setTimeout(() => {
              if (!isResolved) {
                isResolved = true;
                chrome.runtime.onMessage.removeListener(onMessageListener);
                chrome.tabs.onUpdated.removeListener(onUpdated);
                chrome.windows.remove(window.id);
                reject(new Error("TIMEOUT"));
              }
            }, 15000); // 15秒タイムアウト
          }
        });
      }
    );
  });
}

// リキャプチャページを検出する関数を強化
function isRecaptchaPage(url, html) {
  if (!url || !html) return false;

  try {
    return (
      url.includes("google.com/sorry/") ||
      url.includes("/recaptcha/") ||
      url.includes("accounts.google.com/Captcha") ||
      url.includes("accounts.google.com/signin/challenge") ||
      url.includes("consent.google.com") ||
      html.includes("g-recaptcha") ||
      html.includes("recaptcha") ||
      html.includes("captcha-form") ||
      html.includes("challenges/styles") ||
      (html.includes("このページについて") &&
        html.includes("通常と異なるトラフィックが検出されました")) ||
      html.includes("ロボットではないことを確認") ||
      html.includes("セキュリティ チェック") ||
      html.includes("検証コード") ||
      html.includes("不審なリクエスト") ||
      html.includes("アクセスが一時的に制限されています") ||
      html.includes(
        "お使いのコンピュータ ネットワークから通常と異なるトラフィック"
      )
    );
  } catch (error) {
    console.error("reCAPTCHA検出エラー:", error);
    return false;
  }
}

// リキャプチャ対策のための待機時間を動的に調整する関数
let recaptchaDetectionCount = 0;
let lastRecaptchaTime = 0;
let recaptchaHandlingInProgress = false;

// リキャプチャ検出時の共通処理
async function handleRecaptchaDetection(
  url,
  keyword,
  currentCount,
  totalCount
) {
  // 既に処理中の場合は重複実行を防止
  if (recaptchaHandlingInProgress) {
    console.log("リキャプチャ処理が既に進行中です");
    return;
  }

  recaptchaHandlingInProgress = true;

  try {
    console.log("リキャプチャ検出処理を開始:", url);

    // 通知を表示
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "reCAPTCHA検出",
      message:
        "Googleの検索でreCAPTCHAが表示されています。手動での対応が必要です。",
      priority: 2,
      requireInteraction: true,
    });

    // タブにメッセージを送信（処理を軽量化）
    try {
      const tabs = await chrome.tabs.query({
        url: "*://*.google.com/*",
        active: true,
      });
      if (tabs.length > 0) {
        chrome.tabs
          .sendMessage(tabs[0].id, {
            type: "RECAPTCHA_DETECTED",
            message: "リキャプチャが検出されました",
          })
          .catch((e) => console.error("タブへのメッセージ送信エラー:", e));
      }
    } catch (error) {
      console.error("タブ検索エラー:", error);
    }

    // ポップアップに通知
    chrome.runtime.sendMessage({
      type: "RECAPTCHA_INTERRUPT",
      payload: {
        lastKeyword: keyword || "不明",
        currentCount: currentCount || 0,
        totalCount: totalCount || 0,
        url: url || "",
        timestamp: new Date().toISOString(),
      },
    });

    // 一時停止状態を保存
    await chrome.storage.local.set({
      pausedState: {
        lastKeyword: keyword || "不明",
        processedCount: currentCount || 0,
        totalKeywords: totalCount || 0,
        timestamp: new Date().toISOString(),
        recaptchaUrl: url || "",
      },
    });

    // Cookieをクリア
    await clearGoogleCookies();

    // 処理完了後、少し待ってからフラグをリセット
    setTimeout(() => {
      recaptchaHandlingInProgress = false;
      console.log("リキャプチャ処理フラグをリセットしました");
    }, 5000); // 5秒後にリセット
  } catch (error) {
    console.error("reCAPTCHA検出処理エラー:", error);
    recaptchaHandlingInProgress = false;
  }
}

// コンテンツスクリプトからの分析開始指示を受け取る
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_ANALYSIS") {
    keywordQueue = msg.payload.keywords;
    currentIndex = 0;
    processKeywords(keywordQueue);
  }
});

// リキャプチャ検出時のメッセージ処理を修正
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RECAPTCHA_DETECTED") {
    handleRecaptchaDetection(
      message.url || sender?.tab?.url || "",
      message.keyword || keywordQueue[currentIndex] || "不明",
      message.currentCount || currentIndex || 0,
      message.totalCount || keywordQueue.length || 0
    );
  }
  // 他のメッセージ処理...
});

// handleRecaptchaError関数を改善
async function handleRecaptchaError(
  keyword,
  processedCount,
  totalKeywords,
  url
) {
  try {
    // 共通の検出処理を呼び出す
    await handleRecaptchaDetection(url, keyword, processedCount, totalKeywords);

    // 通知を表示
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "検索を一時停止します",
      message:
        "reCAPTCHAが検出されたため、処理を一時停止します。手動で対応してください。",
    });

    // 一時停止状態を返す
    return Promise.resolve();
  } catch (error) {
    console.error("reCAPTCHAエラーハンドリング中のエラー:", error);
    return Promise.resolve();
  }
}

// 既存のコードの最後に追加
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url?.startsWith("https://www.google.com/search?")
  ) {
    // ポップアップは使用しないため、この処理は削除
  }
});

// キーワード検索を実行する関数を修正
function searchKeyword(keyword) {
  // 現在のタブを取得
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const currentTab = tabs[0];

    // ランダムなユーザーエージェントを設定
    const userAgent = getRandomUserAgent();

    // スクリプトを実行
    chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: (keyword, userAgent) => {
        // ユーザーエージェントを変更（可能な場合）
        try {
          Object.defineProperty(navigator, "userAgent", {
            get: function () {
              return userAgent;
            },
          });
        } catch (e) {
          console.log("ユーザーエージェント変更エラー:", e);
        }

        // Google検索フォームの要素を取得
        const searchInput = document.querySelector('input[name="q"]');
        const searchForm = document.querySelector('form[role="search"]');

        if (searchInput && searchForm) {
          // 検索フォームに値を設定
          searchInput.value = keyword;
          // フォームをサブミット
          searchForm.submit();
        }
      },
      args: [keyword, userAgent],
    });
  });
}

// メッセージリスナーでsearchKeyword関数を呼び出す
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "searchKeyword") {
    searchKeyword(request.keyword);
  }
  // ... 他のメッセージハンドリング ...
});
