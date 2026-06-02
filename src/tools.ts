// src/tools.ts
import '@logseq/libs';

export async function executeWebSearch(query: string) {
  const apiKey = logseq.settings?.webApiKey; 
  
  if (!apiKey) {
    // 告訴 AI：使用者沒有填寫金鑰，請提醒他去設定
    return JSON.stringify({ error: "Search failed: Web Search API Key is missing. Please instruct the user to configure it in the plugin settings." });
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey, 
        query: query,
        search_depth: "basic",
        include_answer: true,
        max_results: 3
      })
    });

    const data = await response.json();
    
    return JSON.stringify({
      summary: data.answer,
      sources: data.results.map((r: any) => ({ title: r.title, content: r.content }))
    });
    
  } catch (error) {
    // 告訴 AI：網路請求失敗，請自行向使用者致歉並說明無法取得資訊
    return JSON.stringify({ error: "Web search execution failed. Please inform the user that the latest information could not be retrieved due to a network or API error." });
  }
}