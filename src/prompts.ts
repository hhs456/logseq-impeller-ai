// src/prompts.ts
import '@logseq/libs';

interface PromptOptions {
    langName: string;
}

/**
 * 產生靜態的內建提示詞陣列（不含動態時間、§0 override）。
 * 用於：(1) buildSystemPrompt 的基礎 (2) Settings Schema 的預設值顯示
 */
export function getStaticPromptParts(langName: string): string[] {
    return [
        `Respond ALWAYS in ${langName}.`,
        
        `### 2. TOOL USAGE (ANTI-HALLUCINATION)\nYour internal training data is OUTDATED. For any question related to current affairs, facts, or recent developments, you MUST use the "web_search" tool to verify. DO NOT guess.`,
        
        `### 3. CITATION RULE\nWhenever you use the "web_search" tool, strictly separate facts from inferences. Do not claim external data as personal thoughts. MUST append a "參考來源" (Sources) section explicitly citing titles/URLs.`,

        `### 4. WIKI-LINKS\nWhen you mention a person, project, or concept that is likely to exist as a page in the user's notes, you MAY wrap it in [[double square brackets]]. Do not link common words. Never put [[ ]] inside code blocks.`
    ];
}

export function buildSystemPrompt(options: PromptOptions): string {
    const currentDateTime = new Date().toLocaleString('zh-TW');

    const systemPromptParts: string[] = [];

    const override = (logseq.settings?.systemPromptOverride as string)?.trim();
    if (override) {
        systemPromptParts.push(`### 0. CUSTOM INSTRUCTIONS\n${override}`);
    }

    systemPromptParts.push(...getStaticPromptParts(options.langName));
    systemPromptParts.push(`### 1. TIME CONTEXT\n- Current Local Time: ${currentDateTime}`);

    return systemPromptParts.filter(Boolean).join('\n\n');
}
