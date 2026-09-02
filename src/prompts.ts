// src/prompts.ts
import '@logseq/libs';

interface PromptOptions {
    langName: string;
    isWritingToPage: boolean;
    instruction?: string;
    baseCondition?: string;
}

/**
 * 產生靜態的內建提示詞陣列（不含動態時間、§0 override）。
 * 用於：(1) buildSystemPrompt 的基礎 (2) Settings Schema 的預設值顯示
 */
export function getStaticPromptParts(langName: string): string[] {
    return [
        `Respond ALWAYS in ${langName}.`,
        
        `### 2. TOOL USAGE (ANTI-HALLUCINATION)\nYour internal training data is OUTDATED. For any question related to current affairs, facts, or recent developments, you MUST use the "web_search" tool to verify. DO NOT guess.`,
        
        `### 3. CITATION RULE\nWhenever you use the "web_search" tool, strictly separate facts from inferences. Do not claim external data as personal thoughts. MUST append a "參考來源" (Sources) section explicitly citing titles/URLs.`
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

    if (options.isWritingToPage) {
        systemPromptParts.push(
            `### 4. LOGSEQ FORMATTING\nYou MUST use hierarchical Markdown lists. Use proper indentation (spaces) to create nested bullet points representing parent-child relationships. DO NOT output flat lists.\nExample:\n- Parent Topic\n  - Child detail 1\n  - Child detail 2`
        );

        // 💡 這裡就是新增的雙向連結規則
        systemPromptParts.push(
            `### 5. BI-DIRECTIONAL LINKING\nAutomatically identify important entities, proper nouns, core concepts, or key individuals in your response and wrap them in double square brackets to create Logseq Wiki-links (e.g., [[Artificial Intelligence]], [[Taiwan]]). Do not over-link common words.`
        );

        if (options.baseCondition) {
            systemPromptParts.push(`### 6. BASE CONDITION\n${options.baseCondition}`);
        }

        if (options.instruction) {
            systemPromptParts.push(`### 7. TASK INSTRUCTION\n${options.instruction}`);
        }
    }

    return systemPromptParts.filter(Boolean).join('\n\n');
}