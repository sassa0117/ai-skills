import { parse as parseHTML } from "node-html-parser";
import { readFileSync, existsSync } from "fs";
import { fetchPost, fetchPostByUrl, extractFreeContent } from "./wp-fetcher.js";
import { WP_SITE_URL } from "../config.js";

/**
 * ソースの種別を判定
 * @param {string} source - ソース文字列
 * @returns {"wp-url" | "wp-id" | "file" | "text"}
 */
function detectSourceType(source) {
  // WP記事ID（"記事ID:123" or "id:123"）
  if (/^(記事ID|id):?\s*(\d+)$/i.test(source)) {
    return "wp-id";
  }

  // URL（WPサイトのURL）
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return "wp-url";
  }

  // ファイルパス
  if (existsSync(source)) {
    return "file";
  }

  // それ以外はテキスト直接入力
  return "text";
}

/**
 * HTMLをクリーンなテキスト+構造情報に変換
 * @param {string} html - HTML文字列
 * @returns {{plainText: string, headings: string[], structure: string}}
 */
function cleanHTML(html) {
  const root = parseHTML(html);

  // 不要タグ除去
  root.querySelectorAll("script, style, noscript").forEach((el) => el.remove());

  // 見出し抽出
  const headings = [];
  root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    const level = el.tagName.toLowerCase();
    headings.push(`${level}: ${el.text.trim()}`);
  });

  // 構造化テキスト生成
  const structureParts = [];
  function walkNode(node) {
    if (node.nodeType === 3) {
      // テキストノード
      const text = node.text.trim();
      if (text) structureParts.push(text);
      return;
    }

    const tag = node.tagName?.toLowerCase();
    if (!tag) {
      node.childNodes.forEach(walkNode);
      return;
    }

    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        structureParts.push(`\n## ${node.text.trim()}\n`);
        break;
      case "p":
        structureParts.push(`${node.text.trim()}\n`);
        break;
      case "li":
        structureParts.push(`- ${node.text.trim()}`);
        break;
      case "br":
        structureParts.push("\n");
        break;
      case "blockquote":
        structureParts.push(`> ${node.text.trim()}\n`);
        break;
      default:
        node.childNodes.forEach(walkNode);
    }
  }
  walkNode(root);

  const structure = structureParts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const plainText = root.text.replace(/\s+/g, " ").trim();

  return { plainText, headings, structure };
}

/**
 * ソースをパースして統一フォーマットに変換
 * @param {string} source - ソース文字列（URL, ID, ファイルパス, テキスト）
 * @returns {Promise<{title: string, content: string, structure: string, headings: string[], sourceType: string, sourceUrl: string}>}
 */
export async function parseSource(source) {
  const sourceType = detectSourceType(source);

  switch (sourceType) {
    case "wp-id": {
      const id = source.match(/(\d+)/)[1];
      const post = await fetchPost(id);
      const freeHTML = extractFreeContent(post.content);
      const { plainText, headings, structure } = cleanHTML(freeHTML);
      return {
        title: parseHTML(post.title).text.trim(),
        content: plainText,
        structure,
        headings,
        sourceType: "wordpress",
        sourceUrl: post.link,
      };
    }

    case "wp-url": {
      let post;
      if (source.includes(WP_SITE_URL.replace(/^https?:\/\//, ""))) {
        post = await fetchPostByUrl(source);
      } else {
        // 外部URLの場合はHTMLを直接取得
        const res = await fetch(source);
        const html = await res.text();
        const { plainText, headings, structure } = cleanHTML(html);
        const root = parseHTML(html);
        const titleEl = root.querySelector("title");
        return {
          title: titleEl ? titleEl.text.trim() : "外部記事",
          content: plainText,
          structure,
          headings,
          sourceType: "url",
          sourceUrl: source,
        };
      }
      const freeHTML = extractFreeContent(post.content);
      const { plainText, headings, structure } = cleanHTML(freeHTML);
      return {
        title: parseHTML(post.title).text.trim(),
        content: plainText,
        structure,
        headings,
        sourceType: "wordpress",
        sourceUrl: post.link,
      };
    }

    case "file": {
      const raw = readFileSync(source, "utf-8");
      // .html ファイルの場合はHTMLパース
      if (source.endsWith(".html") || source.endsWith(".htm")) {
        const { plainText, headings, structure } = cleanHTML(raw);
        return {
          title: headings[0]?.replace(/^h\d:\s*/, "") || "記事",
          content: plainText,
          structure,
          headings,
          sourceType: "file",
          sourceUrl: "",
        };
      }
      // テキスト/Markdownの場合はそのまま
      const lines = raw.split("\n");
      const title = lines[0]?.replace(/^#\s*/, "").trim() || "記事";
      return {
        title,
        content: raw,
        structure: raw,
        headings: lines
          .filter((l) => l.startsWith("#"))
          .map((l) => l.trim()),
        sourceType: "file",
        sourceUrl: "",
      };
    }

    case "text":
    default: {
      const lines = source.split("\n");
      const title = lines[0]?.trim().slice(0, 50) || "テキスト";
      return {
        title,
        content: source,
        structure: source,
        headings: [],
        sourceType: "text",
        sourceUrl: "",
      };
    }
  }
}
