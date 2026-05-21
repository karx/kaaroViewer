/**
 * reddit.mjs — Reddit content source.
 *
 * Uses the public .json endpoints (no auth required).
 * These are unofficial and may break — fine for prototype use.
 *
 * Flow:
 *   /r/<subreddit>/search.json?q=<query> → post list
 *   Each post becomes a node; subreddit becomes a community node.
 */

import { ContentSource } from './source-base.mjs';
import { log } from '../../logger.mjs';

const REDDIT_BASE = 'https://www.reddit.com';

// CORS proxy for browser-based access (Reddit doesn't set CORS headers)
// corsproxy.io is free, no signup. Replace with your own proxy in production.
const CORS_PROXY = 'https://corsproxy.io/?';
function _proxiedUrl(url) { return CORS_PROXY + encodeURIComponent(url); }

// Default subreddits to search when no subreddit is specified
const DEFAULT_SUBREDDITS = ['aoe2', 'ageofempires'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function _postId(id) { return `rd:${id}`; }
function _subId(sub)  { return `rd:r/${sub}`; }

function _thumbnail(post) {
  const t = post.thumbnail;
  if (t && t !== 'self' && t !== 'default' && t !== 'nsfw' && t !== 'spoiler' && t.startsWith('http')) {
    return t;
  }
  return null;
}

// ── Source class ───────────────────────────────────────────────────────────────

export class RedditSource extends ContentSource {
  name        = 'reddit';
  displayName = 'Reddit';
  icon        = '📡';

  /**
   * Search Reddit posts.
   * @param {string} query — e.g. "TheViper" or "r/aoe2 TheViper"
   */
  async search(query) {
    log('SOURCE', `[Reddit] searching "${query}"`);

    // Parse optional subreddit prefix: "r/aoe2 query text"
    let subreddits = DEFAULT_SUBREDDITS;
    let searchTerm = query;
    const subMatch = query.match(/^r\/(\w+)\s+(.+)$/i);
    if (subMatch) {
      subreddits = [subMatch[1]];
      searchTerm = subMatch[2];
    }

    const nodes = [];
    const edges = [];

    for (const sub of subreddits) {
      try {
        const result = await this._searchSubreddit(sub, searchTerm);
        // Add subreddit community node
        const subNode = {
          id:             _subId(sub),
          label:          `r/${sub}`,
          type:           'subreddit',
          description:    `Reddit community: r/${sub}`,
          image:          null,
          url:            `${REDDIT_BASE}/r/${sub}`,
          _source:        'reddit',
          _sourceIcon:    this.icon,
          instanceofLabel:'subreddit',
          instanceofQids: [],
        };

        if (result.posts.length > 0) {
          nodes.push(subNode);
        }

        for (const post of result.posts) {
          nodes.push(post);
          edges.push({
            from: post.id,
            to:   subNode.id,
            rel:  'membership',
            label: 'posted in',
          });
        }
      } catch (err) {
        log('ERROR', `[Reddit] search in r/${sub} failed`, { message: err.message });
      }
    }

    log('SOURCE', `[Reddit] returning ${nodes.length} nodes`, { ids: nodes.map(n => n.id) });
    return { nodes, edges };
  }

  async _searchSubreddit(subreddit, query) {
    const url = `${REDDIT_BASE}/r/${subreddit}/search.json?${new URLSearchParams({
      q: query, restrict_sr: '1', limit: '8', sort: 'relevance', t: 'all',
    })}`;

    const res = await fetch(_proxiedUrl(url), {
      headers: { 'User-Agent': 'kaaroViewer/2.0' },
    });
    if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
    const json = await res.json();

    const children = json?.data?.children ?? [];
    const posts = children.map(c => {
      const d = c.data;
      return {
        id:             _postId(d.id),
        label:          d.title?.slice(0, 80) ?? 'Untitled',
        type:           'post',
        description:    `↑${d.score} · ${d.num_comments} comments · u/${d.author}` +
                        (d.selftext ? `\n${d.selftext.slice(0, 200)}` : ''),
        image:          _thumbnail(d),
        url:            `${REDDIT_BASE}${d.permalink}`,
        _source:        'reddit',
        _sourceIcon:    this.icon,
        instanceofLabel:'post',
        instanceofQids: [],
        _meta: {
          score:    d.score,
          author:   d.author,
          comments: d.num_comments,
          created:  d.created_utc,
        },
      };
    });

    log('SOURCE', `[Reddit] r/${subreddit}: ${posts.length} posts`);
    return { posts };
  }

  describe() {
    return `Reddit public posts — default subs: ${DEFAULT_SUBREDDITS.join(', ')}`;
  }
}
