// LLM-Gateway: Nachrichtenkonvertierung, OpenAI-kompatibler Gateway-Aufruf, Gemini-Client mit Timeout.
// generateAIContent (Kandidatenlisten, Fallback, Modell-Speicherung) bleibt in server.ts.

import { GoogleGenAI } from '@google/genai';
import { getEffectiveApiConfig } from './ai-config.ts';

export function convertToOpenAIMessages(contents: any, systemInstruction?: any): any[] {
  const messages: any[] = [];
  if (systemInstruction) {
    let sysText = '';
    if (typeof systemInstruction === 'string') {
      sysText = systemInstruction;
    } else if (systemInstruction.parts && Array.isArray(systemInstruction.parts)) {
      sysText = systemInstruction.parts.map((p: any) => p.text || (typeof p === 'string' ? p : '')).join('\n');
    } else if (systemInstruction.text) {
      sysText = systemInstruction.text;
    }
    if (sysText.trim() !== '') {
      messages.push({ role: 'system', content: sysText.trim() });
    }
  }

  if (typeof contents === 'string') {
    messages.push({ role: 'user', content: contents });
  } else if (Array.isArray(contents)) {
    for (const item of contents) {
      if (typeof item === 'string') {
        messages.push({ role: 'user', content: item });
      } else if (item && typeof item === 'object') {
        const role = item.role === 'model' || item.role === 'assistant' ? 'assistant' : (item.role === 'system' ? 'system' : 'user');
        let text = '';
        if (typeof item.content === 'string') {
          text = item.content;
        } else if (Array.isArray(item.parts)) {
          text = item.parts.map((p: any) => p.text || (typeof p === 'string' ? p : '')).join('\n');
        } else if (item.text) {
          text = item.text;
        }
        if (text) {
          messages.push({ role, content: text });
        }
      }
    }
  } else if (contents && typeof contents === 'object') {
    const role = contents.role === 'model' || contents.role === 'assistant' ? 'assistant' : (contents.role === 'system' ? 'system' : 'user');
    let text = '';
    if (typeof contents.content === 'string') {
      text = contents.content;
    } else if (Array.isArray(contents.parts)) {
      text = contents.parts.map((p: any) => p.text || (typeof p === 'string' ? p : '')).join('\n');
    } else if (contents.text) {
      text = contents.text;
    }
    if (text) {
      messages.push({ role, content: text });
    }
  }

  if (messages.length === 0) {
    messages.push({ role: 'user', content: 'Hallo' });
  }

  return messages;
}

export function getGenAIClient(customApiKey?: string, customBaseUrl?: string): GoogleGenAI {
  const { apiKey, baseUrl } = getEffectiveApiConfig(customApiKey, customBaseUrl);
  const options: any = { apiKey: apiKey || '' };
  if (baseUrl) {
    options.httpOptions = { baseUrl };
  }
  return new GoogleGenAI(options);
}

export async function callOpenAICompatibleGateway(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  contents: any;
  config?: any;
}): Promise<{ text?: string }> {
  let endpoint = options.baseUrl;
  if (endpoint.endsWith('/v1')) {
    endpoint = `${endpoint}/chat/completions`;
  } else if (endpoint.endsWith('/v1/')) {
    endpoint = `${endpoint}chat/completions`;
  } else {
    endpoint = `${endpoint}/v1/chat/completions`;
  }

  const messages = convertToOpenAIMessages(options.contents, options.config?.systemInstruction);
  const body: any = {
    model: options.model,
    messages
  };

  if (options.config?.responseMimeType === 'application/json') {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`
    },
    body: JSON.stringify(body)
  });

  const textRes = await res.text();
  let jsonRes: any = {};
  try {
    jsonRes = JSON.parse(textRes);
  } catch {
    if (!res.ok) {
      throw new Error(`Gateway Error (${res.status}): ${textRes}`);
    }
  }

  if (!res.ok || jsonRes.error) {
    const errorMsg = jsonRes.error?.message || jsonRes.error || textRes || `HTTP ${res.status}`;
    const err = new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    (err as any).status = res.status;
    (err as any).data = jsonRes;
    throw err;
  }

  const choiceContent = jsonRes.choices?.[0]?.message?.content || '';
  return { text: choiceContent };
}

export async function generateGeminiContentWithTimeout(ai: any, request: any, timeoutMs = 180000): Promise<any> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ai.models.generateContent(request),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Gemini request timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
