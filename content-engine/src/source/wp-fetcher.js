import { WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD } from "../config.js";

/**
 * WordPress REST API から記事を取得
 * @param {number|string} postId - 記事ID
 * @returns {Promise<{title: string, content: string, excerpt: string, link: string, date: string}>}
 */
export async function fetchPost(postId) {
  const url = `${WP_SITE_URL}/wp-json/wp/v2/posts/${postId}`;
  const headers = {};

  if (WP_USERNAME && WP_APP_PASSWORD) {
    const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString(
      "base64"
    );
    headers["Authorization"] = `Basic ${auth}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(
      `WP API エラー: ${res.status} ${res.statusText} (post ID: ${postId})`
    );
  }

  const data = await res.json();
  return {
    title: data.title?.rendered || "",
    content: data.content?.rendered || "",
    excerpt: data.excerpt?.rendered || "",
    link: data.link || "",
    date: data.date || "",
  };
}

/**
 * URLからスラッグで記事を検索して取得
 * @param {string} articleUrl - 記事URL
 */
export async function fetchPostByUrl(articleUrl) {
  const urlObj = new URL(articleUrl);
  const pathname = urlObj.pathname.replace(/\/$/, "");
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];

  // 末尾が数字ならIDとして直接取得
  if (/^\d+$/.test(lastSegment)) {
    return fetchPost(lastSegment);
  }

  // スラッグで検索（数字以外のセグメントを全て試す）
  const slugCandidates = segments.filter((s) => !/^\d+$/.test(s));
  const slug = slugCandidates[slugCandidates.length - 1] || lastSegment;

  const searchUrl = `${WP_SITE_URL}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`;
  const headers = {};

  if (WP_USERNAME && WP_APP_PASSWORD) {
    const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString(
      "base64"
    );
    headers["Authorization"] = `Basic ${auth}`;
  }

  const res = await fetch(searchUrl, { headers });
  if (!res.ok) {
    throw new Error(`WP API エラー: ${res.status} ${res.statusText}`);
  }

  const posts = await res.json();
  if (posts.length === 0) {
    throw new Error(`記事が見つかりません: ${articleUrl}`);
  }

  const data = posts[0];
  return {
    title: data.title?.rendered || "",
    content: data.content?.rendered || "",
    excerpt: data.excerpt?.rendered || "",
    link: data.link || "",
    date: data.date || "",
  };
}

/**
 * codocペイウォール前の無料部分のみ抽出
 * @param {string} html - 記事HTML
 * @returns {string} - codocブロック前のHTML
 */
export function extractFreeContent(html) {
  // codocブロックのパターン（複数パターン対応）
  const codocPatterns = [
    /<!-- wp:codoc[\s\S]*$/i,
    /<!-- codoc[\s\S]*$/i,
    /<div[^>]*class="[^"]*codoc[^"]*"[\s\S]*$/i,
    /<script[^>]*codoc[\s\S]*$/i,
  ];

  let cleaned = html;
  for (const pattern of codocPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned.trim();
}
