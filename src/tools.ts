// src/tools.ts
import '@logseq/libs';
import { searchSimilarBlocks, getLinkedReferencesForPage } from './rag';

/**
 * 1. 工具註冊中心 (Tool Registry)
 * 集中管理所有提供給 LLM 的工具說明書。
 */
export function getAvailableTools() {
    const tools: any[] = [];
    const settings = logseq.settings;

    // 工具 A：網路搜尋
    if (settings?.webApiKey) {
        tools.push({
            type: "function",
            function: {
                name: "web_search",
                description: "Use this tool for queries about current events, recent news, real-time data, dates, or when your internal knowledge is outdated. Do not answer from memory for current facts.",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The search query or keywords." }
                    },
                    required: ["query"]
                }
            }
        });
    }

    // 工具 B：本地語意搜尋 (RAG)
    tools.push({
        type: "function",
        function: {
            name: "semantic_search",
            description: "Fuzzy semantic search for the local knowledge base. Use this tool to retrieve broad context, detailed content, or implicit themes about a specific topic.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search query or sentence. Include rich context if possible." }
                },
                required: ["query"]
            }
        }
    });

    // 工具 C：圖譜標籤搜尋 (Datalog)
    tools.push({
        type: "function",
        function: {
            name: "graph_tag_search",
            description: "Precise graph database search. Use this tool to find all notes explicitly linked to a specific tag or page. Ideal for cross-referencing, finding similar entities, or listing items under a category.",
            parameters: {
                type: "object",
                properties: {
                    target_page: { type: "string", description: "The target tag or page name. Do not include the '#' symbol." }
                },
                required: ["target_page"]
            }
        }
    });

    return tools.length > 0 ? tools : undefined;
}

/**
 * 2. 工具路由/分發器 (Tool Dispatcher)
 * 接收 LLM 回傳的 tool_call，並轉交給對應的執行函數。
 */
export async function executeToolCall(toolName: string, args: any): Promise<string> {
    try {
        console.log(`[Tool 執行] 啟動工具: ${toolName}`, args);
        
        switch (toolName) {
            case "web_search":
                return await executeWebSearch(args.query);
                
            case "semantic_search":
                const blocks = await searchSimilarBlocks(args.query);
                return JSON.stringify({ results: blocks });
                
            case "graph_tag_search":
                const refs = await getLinkedReferencesForPage(args.target_page);
                return JSON.stringify({ results: refs });
                
            default:
                console.warn(`未知的工具呼叫: ${toolName}`);
                return JSON.stringify({ error: `Tool ${toolName} is not implemented.` });
        }
    } catch (error) {
        console.error(`[Tool 錯誤] ${toolName} 執行失敗:`, error);
        return JSON.stringify({ error: `Execution failed for tool: ${toolName}` });
    }
}

/**
 * 3. 具體工具實作區 (保留你原本寫好的 Web Search)
 */
export async function executeWebSearch(query: string) {
    const apiKey = logseq.settings?.webApiKey; 
    
    if (!apiKey) {
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
        return JSON.stringify({ error: "Web search execution failed. Please inform the user that the latest information could not be retrieved due to a network or API error." });
    }
}