/**
 * API route: /api/agent/chat
 *
 * POST /api/agent/chat — Send a message to the conversational agent.
 *
 * The agent uses RAG (retrieval-augmented generation) to answer questions
 * about saved content. Conversations are persisted in the DB and can be
 * resumed by passing conversationId.
 *
 * Request body:
 *   message         (string, required) — the user's message
 *   conversationId  (string, optional) — resume an existing conversation;
 *                   omit to start a new one (a new ID is returned)
 *
 * Response: 200 OK
 *   {
 *     conversationId: string,
 *     answer: string,          — markdown-formatted response with [N] citations
 *     citations: Array<{ id, title, url, sourceType }>,
 *     chunksUsed: number       — number of content chunks used as context
 *   }
 *
 * GET /api/agent/chat?conversationId=<id> — fetch messages for a conversation
 * GET /api/agent/chat                     — list all conversations
 */

import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { ragQuery } from "@/lib/agent/rag";
import {
  insertChatConversation,
  insertChatMessage,
  getChatMessages,
  getChatConversations,
} from "@/lib/db";

export async function POST(request: NextRequest) {
  let body: { message?: string; conversationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { message, conversationId } = body;

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      convId = crypto.randomUUID();
      insertChatConversation({ id: convId, title: message.slice(0, 100) });
    }

    // Store user message
    insertChatMessage({
      id: crypto.randomUUID(),
      conversationId: convId,
      role: "user",
      content: message,
    });

    // Run RAG query
    const result = await ragQuery(message);

    // Store assistant response
    insertChatMessage({
      id: crypto.randomUUID(),
      conversationId: convId,
      role: "assistant",
      content: result.answer,
      citations: JSON.stringify(result.citations),
    });

    return NextResponse.json({
      conversationId: convId,
      answer: result.answer,
      citations: result.citations,
      chunksUsed: result.chunksUsed,
    });
  } catch (error) {
    apiLogger.error({ err: error }, "Chat endpoint error");
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");

    if (conversationId) {
      const messages = getChatMessages(conversationId);
      return NextResponse.json({ messages });
    }

    const conversations = getChatConversations();
    return NextResponse.json({ conversations });
  } catch (error) {
    apiLogger.error({ err: error }, "Chat GET endpoint error");
    return NextResponse.json(
      { error: "Failed to fetch chat data" },
      { status: 500 },
    );
  }
}
