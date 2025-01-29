// background.js

// 分析対象のキーワードリスト
let keywordQueue = [];
let currentIndex = 0;

// キーワードを順番に処理するフロー
async function processKeywords(keywords) {
  const chunks = [];
  for (let i = 0; i < keywords.length; i += 5) {
    chunks.push(keywords.slice(i, i + 5));
  }

  const totalKeywords = keywords.length;
  let processedCount = 0;

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        // インターバル待機中のメッセージを表示
        for (let waitTime = 20; waitTime > 0; waitTime--) {
          chrome.runtime.sendMessage({
            type: "ANALYSIS_UPDATE",
            payload: {
              currentKeyword: "インターバル待機中",
              progressText: `次のバッチまで残り${waitTime}秒 (${processedCount}/${totalKeywords}キーワード完了)`,
            },
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      processedCount = await searchKeywords(
        chunks[i],
        processedCount,
        totalKeywords
      );
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

    if (error.message === "RECAPTCHA_DETECTED") {
      // リキャプチャエラーの場合は既に通知済みなので、追加の処理は不要
    } else {
      // その他のエラーの場合
      await notifySlack(
        `処理中にエラーが発生しました: ${error.message}`,
        keywords[processedCount],
        processedCount,
        totalKeywords
      );

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon48.png",
        title: "エラーが発生しました",
        message: `処理中にエラーが発生しました: ${error.message}`,
      });

      chrome.runtime.sendMessage({
        type: "ANALYSIS_ERROR",
        payload: {
          error: error.message,
          lastKeyword: keywords[processedCount],
          currentCount: processedCount,
          totalCount: totalKeywords,
        },
      });
    }
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
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
        keyword
      )}`;

      // タブを作成して検索結果を取得
      const results = await getSearchResults(
        searchUrl,
        keyword,
        localProcessedCount,
        totalKeywords
      );
      console.log("検索結果解析完了:", results);

      // カウンターをインクリメント
      localProcessedCount++;

      // 結果を送信
      chrome.runtime.sendMessage({
        type: "ANALYSIS_RESULT",
        payload: {
          keywordResult: {
            Keyword: keyword,
            ...results,
          },
          progressInfo: {
            current: localProcessedCount,
            total: totalKeywords,
            processingTime: "1.0",
          },
        },
      });

      // 進捗状況の更新メッセージを送信
      chrome.runtime.sendMessage({
        type: "ANALYSIS_UPDATE",
        payload: {
          currentKeyword: keyword,
          progressText: `処理中: ${localProcessedCount}/${totalKeywords}キーワード完了`,
        },
      });

      // 次のキーワードの前に少し待機
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("検索エラー:", error);

      // リキャプチャ検出時の処理を強化
      if (error.message === "RECAPTCHA_DETECTED") {
        // Slack通知を送信
        await notifySlack(
          "検索が一時停止されました。手動での対応が必要です。",
          keyword,
          localProcessedCount,
          totalKeywords
        );

        // 通知を表示
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: "リキャプチャが検出されました",
          message:
            "検索が一時停止されました。これまでの結果をダウンロードできます。",
        });

        // 中断メッセージを送信
        chrome.runtime.sendMessage({
          type: "RECAPTCHA_INTERRUPT",
          payload: {
            lastKeyword: keyword,
            currentCount: localProcessedCount,
            totalCount: totalKeywords,
          },
        });
      }
      throw error; // エラーを上位に伝播
    }
  }
  return localProcessedCount;
}

async function searchSingleKeyword(keyword, processedCount, totalKeywords) {
  try {
    const startTime = Date.now();

    chrome.runtime.sendMessage({
      type: "ANALYSIS_UPDATE",
      payload: {
        currentKeyword: keyword,
        progressText: `処理中: ${
          processedCount + 1
        }/${totalKeywords}キーワード目`,
      },
    });

    // --- 1. 通常検索 ---
    let normalUrl =
      "https://www.google.com/search?q=" + encodeURIComponent(keyword);
    let normalResults = await getSearchResults(
      normalUrl,
      keyword,
      processedCount,
      totalKeywords
    );

    // --- 2. intitle検索 ---
    let intitleUrl =
      "https://www.google.com/search?q=intitle%3A" +
      encodeURIComponent(keyword);
    let intitleResults = await getSearchResults(
      intitleUrl,
      keyword,
      processedCount,
      totalKeywords
    );

    // --- 3. allintitle検索 ---
    let allintitleUrl =
      "https://www.google.com/search?q=allintitle%3A" +
      encodeURIComponent(keyword);
    let allintitleResults = await getSearchResults(
      allintitleUrl,
      keyword,
      processedCount,
      totalKeywords
    );

    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(1);

    // 取得結果を集約
    let keywordResult = {
      Keyword: keyword,
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

    // ポップアップへ結果を送信
    chrome.runtime.sendMessage({
      type: "ANALYSIS_RESULT",
      payload: {
        keywordResult,
        progressInfo: {
          current: processedCount + 1,
          total: totalKeywords,
          processingTime: processingTime,
        },
      },
    });

    // 連続で叩くとGoogleにブロックされやすいので適宜待機を入れる
    await new Promise((resolve) => setTimeout(resolve, 2000)); // 2秒待機
  } catch (error) {
    if (error.message === "RECAPTCHA_DETECTED") {
      // エラーを上位に伝播させて処理を中断
      throw error;
    }
    // その他のエラーの場合は通常のエラーハンドリング
    console.error("検索エラー:", error);
  }
}

// リキャプチャ検出時のSlack通知関数
async function notifySlack(
  message,
  keyword = "",
  processedCount = 0,
  totalKeywords = 0
) {
  const SLACK_WEBHOOK_URL =
    "https://hooks.slack.com/services/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";

  const payload = {
    text: "🚨 リキャプチャ検出アラート",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*リキャプチャが検出されました*\n${message}`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*最後のキーワード:*\n${keyword || "不明"}`,
          },
          {
            type: "mrkdwn",
            text: `*進捗状況:*\n${processedCount}/${totalKeywords} キーワード完了`,
          },
          {
            type: "mrkdwn",
            text: `*検出時刻:*\n${new Date().toLocaleString("ja-JP")}`,
          },
        ],
      },
    ],
  };

  try {
    console.log("Slack通知を送信中...", payload);
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Slack通知エラー:", errorText);
      throw new Error(`Slack通知エラー: ${response.status} ${errorText}`);
    }

    console.log("Slack通知送信成功");
  } catch (error) {
    console.error("Slack通知送信エラー:", error);
    // エラーを上位に伝播させない（通知の失敗は主処理を止めない）
  }
}

// Google検索URLを開き、contentScriptからDOM解析結果を受け取る
function getSearchResults(searchUrl, keyword, processedCount, totalKeywords) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
      const onMessageListener = (message, sender, sendResponse) => {
        if (message.type === "DOM_PARSED" && sender.tab.id === tab.id) {
          let data = message.payload;
          chrome.tabs.remove(tab.id);
          chrome.runtime.onMessage.removeListener(onMessageListener);
          resolve(data);
        } else if (
          message.type === "RECAPTCHA_DETECTED" &&
          sender.tab.id === tab.id
        ) {
          // リキャプチャ検出時の処理
          chrome.tabs.remove(tab.id);
          chrome.runtime.onMessage.removeListener(onMessageListener);

          // 通知を表示
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon48.png",
            title: "リキャプチャが検出されました",
            message:
              "検索が一時停止されました。これまでの結果をダウンロードできます。",
          });

          // Slackに通知
          notifySlack(
            "検索が一時停止されました。手動での対応が必要です。",
            keyword,
            processedCount,
            totalKeywords
          );

          // 中断メッセージを送信
          chrome.runtime.sendMessage({
            type: "RECAPTCHA_INTERRUPT",
            payload: {
              lastKeyword: keyword,
              currentCount: processedCount,
              totalCount: totalKeywords,
            },
          });

          reject(new Error("RECAPTCHA_DETECTED"));
        }
      };

      // タブの読み込み完了を監視
      chrome.tabs.onUpdated.addListener(function onUpdated(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          // タブの読み込みが完了したら少し待ってからチェック
          setTimeout(() => {
            // 30秒後にタイムアウト
            setTimeout(() => {
              chrome.tabs.get(tab.id, (tabInfo) => {
                if (tabInfo) {
                  // タブがまだ存在する場合
                  chrome.tabs.remove(tab.id);
                  chrome.runtime.onMessage.removeListener(onMessageListener);
                  reject(new Error("RECAPTCHA_DETECTED"));
                }
              });
            }, 30000);
          }, 1000);
        }
      });

      chrome.runtime.onMessage.addListener(onMessageListener);
    });
  });
}

// reCAPTCHAページを検出する関数を修正
function isRecaptchaPage(url, html) {
  return (
    url.includes("google.com/sorry/") || // Google sorry ページの検出を追加
    html.includes("g-recaptcha") ||
    html.includes("recaptcha") ||
    (html.includes("このページについて") &&
      html.includes("通常と異なるトラフィックが検出されました"))
  );
}

// manifest.json で webRequest 権限が必要
chrome.webRequest?.onCompleted?.addListener(
  function (details) {
    if (details.type === "main_frame") {
      chrome.tabs.get(details.tabId, function (tab) {
        if (
          tab &&
          (tab.url.includes("google.com/sorry/") ||
            tab.url.includes("/recaptcha/") ||
            (tab.url.includes("google.com/search") &&
              details.statusCode === 429))
        ) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon48.png",
            title: "reCAPTCHA検出",
            message:
              "Googleの検索でreCAPTCHAが表示されています。手動での対応が必要です。",
          });

          try {
            chrome.tabs.sendMessage(details.tabId, {
              type: "RECAPTCHA_DETECTED",
              message: "リキャプチャが検出されました",
            });
          } catch (error) {
            console.error("タブへのメッセージ送信エラー:", error);
          }

          chrome.runtime.sendMessage({
            type: "RECAPTCHA_INTERRUPT",
          });

          // Slackに通知
          notifySlack(
            "Googleの検索でreCAPTCHAが表示されています。手動での対応が必要です。",
            keywordQueue[currentIndex],
            currentIndex,
            keywordQueue.length
          );
        }
      });
    }
  },
  { urls: ["*://*.google.com/*"] }
);

// popup.js からの分析開始指示を受け取る
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_ANALYSIS") {
    keywordQueue = msg.payload.keywords;
    currentIndex = 0;
    processKeywords(keywordQueue);
  }
});
