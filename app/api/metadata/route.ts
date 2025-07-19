import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

// In-memory cache with TTL (7 days)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Clean up expired cache entries
const cleanupCache = () => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      cache.delete(key);
    }
  }
};

// Clean up cache every hour
setInterval(cleanupCache, 60 * 60 * 1000);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing URL parameter' }, { status: 400 });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  // Check cache first
  const cachedResult = cache.get(url);
  if (cachedResult && (Date.now() - cachedResult.timestamp) < CACHE_DURATION) {
    console.log(`📦 Cache HIT for: ${url.substring(0, 50)}...`);
    return NextResponse.json(cachedResult.data, {
      headers: {
        'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400', // 7 days cache, 1 day stale
        'X-Cache-Status': 'HIT'
      }
    });
  }

  console.log(`🌐 Cache MISS - Fetching: ${url.substring(0, 50)}...`);

  try {
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 10000, // 10 second timeout
      maxRedirects: 5,
    });

    const $ = cheerio.load(html);
    const baseUrl = new URL(url);

    // Helper function to resolve relative URLs
    const resolveUrl = (relativeUrl: string) => {
      if (!relativeUrl) return '';
      try {
        return new URL(relativeUrl, url).toString();
      } catch {
        return relativeUrl;
      }
    };

    // Extract favicon
    let favicon = '';
    const faviconSelectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]'
    ];
    
    for (const selector of faviconSelectors) {
      const faviconHref = $(selector).attr('href');
      if (faviconHref) {
        favicon = resolveUrl(faviconHref);
        break;
      }
    }
    
    // Fallback to /favicon.ico
    if (!favicon) {
      favicon = `${baseUrl.protocol}//${baseUrl.host}/favicon.ico`;
    }

    const metadata = {
      title: $('meta[property="og:title"]').attr('content') || 
             $('meta[name="twitter:title"]').attr('content') || 
             $('title').text().trim() || 
             baseUrl.hostname,
      description: $('meta[property="og:description"]').attr('content') || 
                   $('meta[name="twitter:description"]').attr('content') || 
                   $('meta[name="description"]').attr('content') || 
                   '',
      image: resolveUrl($('meta[property="og:image"]').attr('content') || 
                        $('meta[name="twitter:image"]').attr('content') || 
                        ''),
      logo: favicon,
      siteName: $('meta[property="og:site_name"]').attr('content') || 
                baseUrl.hostname,
      url: $('meta[property="og:url"]').attr('content') || url,
      type: $('meta[property="og:type"]').attr('content') || 'website',
    };

    // Clean up title (remove extra whitespace and newlines)
    if (metadata.title) {
      metadata.title = metadata.title.replace(/\s+/g, ' ').trim();
    }

    // Cache the result
    cache.set(url, { data: metadata, timestamp: Date.now() });
    console.log(`💾 Cached metadata for: ${url.substring(0, 50)}...`);

    return NextResponse.json(metadata, {
      headers: {
        'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400', // 7 days cache, 1 day stale
        'X-Cache-Status': 'MISS'
      }
    });
      } catch (error: any) {
      console.error('Metadata fetch error:', error.message);
      
      // Return fallback metadata
      const baseUrl = new URL(url);
      const fallbackMetadata = {
        title: baseUrl.hostname,
        description: '',
        image: '',
        logo: `${baseUrl.protocol}//${baseUrl.host}/favicon.ico`,
        siteName: baseUrl.hostname,
        url: url,
        type: 'website',
        error: 'Failed to fetch full metadata'
      };

      // Cache fallback for shorter duration (1 hour)
      cache.set(url, { data: fallbackMetadata, timestamp: Date.now() - CACHE_DURATION + (60 * 60 * 1000) });
      
      return NextResponse.json(fallbackMetadata, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800', // 1 hour cache for errors
          'X-Cache-Status': 'ERROR'
        }
      });
    }
} 