// src/tools.ts
import '@logseq/libs';
import { searchSimilarBlocks, getLinkedReferencesForPage } from './rag';
import { getTxt } from './utils/markdown';
import { escapeDsString } from './utils/query';

/**
 * 1. 工具註冊中心 (Tool Registry)
 * 集中管理所有提供給 LLM 的工具說明書。
 */
export function getAvailableTools() {
    const tools: any[] = [];
    const settings = logseq.settings;

    // 工具 A：網路搜尋
    if (settings?.enableWebSearch && settings?.webApiKey) {
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

    if (settings?.enableSemanticSearch !== false) {
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
    }

    // 工具 D：讀取頁面大綱骨架 (解決程式碼/大檔案 Token 爆炸)
    tools.push({
        type: "function",
        function: {
            name: "get_page_outline",
            description: "Reads the hierarchical outline and block UUIDs of a specific Logseq page. Use this tool FIRST when tasked with reading long documents, notes, or source code files to understand the overall structure. Never attempt to read the entire page directly without using this tool.",
            parameters: {
                type: "object",
                properties: {
                    page_name: { type: "string", description: "The exact name of the Logseq page or file to read (e.g., actions.ts)." }
                },
                required: ["page_name"]
            }
        }
    });

    // 工具 E：精準讀取特定區塊 (配合大綱使用)
    tools.push({
        type: "function",
        function: {
            name: "read_target_block",
            description: "Precisely retrieves the full, detailed text content of a specific block and all its nested children using its UUID. Use this tool to inspect specific sections discovered via the get_page_outline tool.",
            parameters: {
                type: "object",
                properties: {
                    uuid: { type: "string", description: "The specific UUID of the target block." }
                },
                required: ["uuid"]
            }
        }
    });

    // 工具 F：全域搜尋器 (Grep)
    tools.push({
        type: "function",
        function: {
            name: "global_keyword_search",
            description: "Searches the entire Logseq graph/codebase for a specific keyword, function name, or variable. Use this to find out WHICH file contains a definition or WHERE a function is called across different scripts.",
            parameters: {
                type: "object",
                properties: {
                    keyword: { type: "string", description: "The exact function name or keyword to search for (e.g., 'sendMsg' or 'MemoryManager')." }
                },
                required: ["keyword"]
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

            // 🆕 新增路由處理
            case "get_page_outline":
                return await executeGetPageOutline(args.page_name);

            case "read_target_block":
                return await executeReadTargetBlock(args.uuid);

            // 💡 補上這個全域搜尋的路由！
            case "global_keyword_search":
                return await executeGlobalKeywordSearch(args.keyword);

            default:
                console.warn(`未知的工具呼叫: ${toolName}`);
                return JSON.stringify({ error: `Tool ${toolName} is not implemented.` });
        }
    } catch (error: any) {
        console.error(`[Tool 錯誤] ${toolName} 執行失敗:`, error);
        return JSON.stringify({ error: `Execution failed for tool: ${toolName}, reason: ${error.message}` });
    }
}

/**
 * 3. 具體工具實作區
 */

// 🆕 實作：獲取頁面大綱
async function executeGetPageOutline(pageName: string): Promise<string> {
    const blocks = await logseq.Editor.getPageBlocksTree(pageName);
    if (!blocks || blocks.length === 0) {
        return JSON.stringify({ error: `找不到頁面『${pageName}』或頁面內容為空。` });
    }

    let outline = `【${pageName} 的大綱結構】\n`;
    blocks.forEach((b: any) => {
        const preview = b.content.substring(0, 70).replace(/\n/g, " ");
        outline += `- [UUID: ${b.uuid}] ${preview}...\n`;
        if (b.children && b.children.length > 0) {
            outline += `  (此區塊內部還包含 ${b.children.length} 個子節點/子行程式碼)\n`;
        }
    });

    outline += `\n💡 系統提示：請根據上述大綱，挑選與任務最相關的區塊 UUID，並呼叫 read_target_block 工具讀取細節。`;
    return outline;
}

// 🆕 實作：精準讀取特定區塊樹
async function executeReadTargetBlock(uuid: string): Promise<string> {
    const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
    if (!block) return JSON.stringify({ error: "找不到此區塊，可能已被刪除。" });

    const totalContent = block.content + '\n' + (block.children ? getTxt(block.children) : '');

    return totalContent;
}

// 原本就寫得很好的 Web Search
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

// 修改後的全域搜尋實作
export async function executeGlobalKeywordSearch(keyword: string): Promise<string> {
    try {
        const escapedKeyword = escapeDsString(keyword);
        const query = `
            [:find (pull ?b [*])
             :where
             [?b :block/content ?c]
             [(clojure.string/includes? ?c "${escapedKeyword}")]]
        `;
        const results = await logseq.DB.datascriptQuery(query);

        if (!results || results.length === 0) {
            return `No results found for keyword: ${keyword}`;
        }

        // 💡 修正：把 \\n 改成 \n
        let report = `【搜尋 "${keyword}" 的全域結果】\n`;
        
        const limitedResults = results.slice(0, 10);
        for (const res of limitedResults) {
            const block = res[0];
            const page = await logseq.Editor.getPage(block.page.id);
            const pageName = page ? page.name : "Unknown Page";
            // 💡 修正：正則表達式的 /\\n/g 改成 /\n/g，結尾的 \\n 改成 \n
            report += `- [檔案/頁面: ${pageName}] (UUID: ${block.uuid}) : ${block.content.substring(0, 50).replace(/\n/g, " ")}...\n`;
        }

        // 💡 修正：把 \\n 改成 \n
        report += `\n💡 系統提示：請根據上述結果找出包含目標宣告的檔案，再使用 get_page_outline 深入閱讀。`;
        return report;
    } catch (e) {
        return `Search failed.`;
    }
}