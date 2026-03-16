import { NextResponse } from 'next/server'

// Cache the promise so concurrent requests don't trigger multiple fetches,
// and cache the result in memory for the lifecycle of the Vercel function/server.
let cachedFontsPromise: Promise<any[]> | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

async function fetchGoogleFonts() {
  const now = Date.now();
  if (cachedFontsPromise && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedFontsPromise;
  }

  cachedFontsPromise = (async () => {
    try {
      // Use the canonical undocumented Google Fonts metadata endpoint
      // This is what fonts.google.com uses internally. Free, no API key needed, always up-to-date.
      const res = await fetch('https://fonts.google.com/metadata/fonts', {
        next: { revalidate: 86400 } // Next.js cache for 24 hours
      });

      if (!res.ok) {
        throw new Error('Failed to fetch from Google Fonts metadata');
      }

      const data = await res.json();
      
      // We only care about family, category, and popularity
      // Popularity is an integer where smaller = more popular (e.g. Roboto = 2)
      const fonts = data.familyMetadataList.map((f: any) => ({
        family: f.family,
        category: f.category?.toLowerCase().replace(' ', '-') || 'sans-serif',
        popularity: f.popularity || 99999
      }));

      // Pre-sort by popularity
      fonts.sort((a: any, b: any) => a.popularity - b.popularity);
      
      lastFetchTime = Date.now();
      return fonts;
    } catch (error) {
      console.error('Error fetching google fonts:', error);
      cachedFontsPromise = null; // Reset on failure
      return [];
    }
  })();

  return cachedFontsPromise;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toLowerCase() || '';

    const allFonts = await fetchGoogleFonts();

    let filtered = allFonts;
    
    // If a query is provided, filter by family name
    if (query) {
      filtered = allFonts.filter((f) => 
        f.family.toLowerCase().includes(query)
      );
    }

    // Return only the top 10 exact matches or most popular to keep response tiny and fast
    const results = filtered.slice(0, 10).map(({ family, category }) => ({
      family,
      category
    }));

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
