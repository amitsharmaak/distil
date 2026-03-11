/**
 * Registers all agent tools with the tool registry.
 * Call this once at startup.
 * SERVER-SIDE ONLY.
 */

import { getToolRegistry } from "./tool-registry";
import {
  getItems,
  getItemById,
  deleteItem,
  updateItem,
  insertItem,
  getAllFeedback,
  getAISummary,
  insertNotification,
} from "@/lib/db";
import { hybridSearch } from "@/lib/ai/search";
import { getPreferences } from "@/lib/ai/preferences";
import { generateSummary } from "@/lib/ai/summarize";
import { generateTextWithSearch } from "@/lib/ai/router";
import { extractContent } from "@/lib/content-extractor";
import type { ContentItem } from "@/lib/types";

export function registerAllTools(): void {
  const registry = getToolRegistry();

  registry.register({
    name: "search_items",
    description: "Search the user's saved content using full-text and semantic search",
    category: "READ",
    rateLimit: 60,
    requiresApproval: false,
    parameters: {
      query: { type: "string", description: "Search query", required: true },
      source: { type: "string", description: "Filter by source type" },
      priority: { type: "string", description: "Filter by priority" },
      unread_only: { type: "boolean", description: "Only unread items" },
      limit: { type: "number", description: "Max results (default 10)" },
    },
    handler: async (params) => {
      const items = await hybridSearch(params.query as string, {
        sourceType: params.source as string | undefined,
        priority: params.priority as string | undefined,
        isRead: params.unread_only ? false : undefined,
        limit: (params.limit as number) ?? 10,
      });
      return items.map((i) => ({
        id: i.id,
        title: i.title,
        summary: i.summary,
        sourceType: i.sourceType,
        priority: i.priority,
        url: i.url,
      }));
    },
  });

  registry.register({
    name: "get_item",
    description: "Get a specific content item by ID",
    category: "READ",
    rateLimit: 120,
    requiresApproval: false,
    parameters: {
      id: { type: "string", description: "Item ID", required: true },
    },
    handler: async (params) => {
      const item = getItemById(params.id as string);
      if (!item) throw new Error(`Item not found: ${params.id}`);
      return item;
    },
  });

  registry.register({
    name: "get_user_preferences",
    description: "Get the user's learned preferences from feedback history",
    category: "READ",
    rateLimit: 10,
    requiresApproval: false,
    parameters: {},
    handler: async () => getPreferences(),
  });

  registry.register({
    name: "get_feedback_history",
    description: "Get recent user feedback on content items",
    category: "READ",
    rateLimit: 10,
    requiresApproval: false,
    parameters: {
      limit: { type: "number", description: "Max results" },
    },
    handler: async (params) => {
      const all = getAllFeedback();
      const limit = (params.limit as number) ?? 50;
      return all.slice(0, limit);
    },
  });

  registry.register({
    name: "list_topics",
    description: "List all topics from saved items with counts",
    category: "READ",
    rateLimit: 10,
    requiresApproval: false,
    parameters: {},
    handler: async () => {
      const items = getItems({ limit: 500 });
      const topicCounts = new Map<string, number>();
      for (const item of items) {
        for (const topic of item.topics) {
          topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
        }
      }
      return Array.from(topicCounts.entries())
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count);
    },
  });

  registry.register({
    name: "get_summary",
    description: "Get the AI summary for an item",
    category: "READ",
    rateLimit: 60,
    requiresApproval: false,
    parameters: {
      item_id: { type: "string", description: "Item ID", required: true },
      type: { type: "string", description: "brief or detailed" },
    },
    handler: async (params) => {
      const summary = getAISummary(
        params.item_id as string,
        params.type as "brief" | "detailed" | undefined,
      );
      return summary ?? null;
    },
  });

  registry.register({
    name: "mark_read",
    description: "Mark a content item as read",
    category: "WRITE-LOW",
    rateLimit: 60,
    requiresApproval: false,
    parameters: {
      item_id: { type: "string", description: "Item ID", required: true },
    },
    handler: async (params) => {
      const result = updateItem(params.item_id as string, { isRead: true });
      return { success: !!result };
    },
  });

  registry.register({
    name: "set_priority",
    description: "Update the priority level of a content item",
    category: "WRITE-LOW",
    rateLimit: 60,
    requiresApproval: false,
    parameters: {
      item_id: { type: "string", description: "Item ID", required: true },
      priority: {
        type: "string",
        description: "high, medium, or low",
        required: true,
      },
      reason: { type: "string", description: "Why this priority (for audit)" },
    },
    handler: async (params) => {
      const result = updateItem(params.item_id as string, {
        priority: params.priority as "high" | "medium" | "low",
      });
      return { success: !!result };
    },
  });

  registry.register({
    name: "add_summary",
    description: "Generate or regenerate an AI summary for an item",
    category: "WRITE-MED",
    rateLimit: 30,
    requiresApproval: false,
    parameters: {
      item_id: { type: "string", description: "Item ID", required: true },
      length: { type: "string", description: "brief or detailed" },
    },
    handler: async (params) => {
      return generateSummary(params.item_id as string, {
        length: (params.length as "brief" | "detailed") ?? "brief",
      });
    },
  });

  registry.register({
    name: "send_notification",
    description: "Send an in-app notification to the user",
    category: "WRITE-MED",
    rateLimit: 10,
    requiresApproval: false,
    parameters: {
      title: { type: "string", description: "Notification title", required: true },
      message: {
        type: "string",
        description: "Notification message",
        required: true,
      },
      item_id: {
        type: "string",
        description: "Related item ID",
        required: true,
      },
    },
    handler: async (params) => {
      insertNotification({
        id: crypto.randomUUID(),
        itemId: params.item_id as string,
        title: params.title as string,
        message: params.message as string,
      });
      return { success: true };
    },
  });

  registry.register({
    name: "create_item",
    description: "Create a new content item (requires user approval)",
    category: "WRITE-HIGH",
    rateLimit: 10,
    requiresApproval: true,
    parameters: {
      url: { type: "string", description: "URL of the content", required: true },
      title: { type: "string", description: "Title", required: true },
      sourceType: {
        type: "string",
        description: "Source type (slack, gmail, manual, browser-extension)",
        required: true,
      },
    },
    handler: async (params) => {
      const item: ContentItem = {
        id: crypto.randomUUID(),
        title: params.title as string,
        summary: "",
        sourceType: params.sourceType as ContentItem["sourceType"],
        contentType: "article",
        topics: [],
        url: params.url as string,
        priority: "medium",
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      return insertItem(item);
    },
  });

  registry.register({
    name: "delete_item",
    description: "Delete a content item (requires user approval)",
    category: "WRITE-HIGH",
    rateLimit: 5,
    requiresApproval: true,
    parameters: {
      item_id: { type: "string", description: "Item ID", required: true },
    },
    handler: async (params) => {
      return { deleted: deleteItem(params.item_id as string) };
    },
  });

  registry.register({
    name: "web_search",
    description:
      "Search the web for current information using Google Search grounding",
    category: "EXTERNAL",
    rateLimit: 20,
    requiresApproval: false,
    parameters: {
      query: { type: "string", description: "Search query", required: true },
    },
    handler: async (params) => {
      const query = params.query as string;
      const prompt = `Search the web for current information: ${query}`;
      return generateTextWithSearch(prompt);
    },
  });

  registry.register({
    name: "extract_content",
    description:
      "Extract article content and metadata from a URL using Readability",
    category: "EXTERNAL",
    rateLimit: 20,
    requiresApproval: false,
    parameters: {
      url: { type: "string", description: "URL to extract content from", required: true },
    },
    handler: async (params) => {
      const result = await extractContent(params.url as string);
      if (!result)
        return { success: false, error: "Could not extract content from URL" };
      return {
        success: true,
        title: result.title,
        byline: result.byline,
        textContent: result.textContent.slice(0, 5000),
        extractedLinksCount: result.extractedLinks.length,
      };
    },
  });
}
