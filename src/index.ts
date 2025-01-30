interface Env {
	CORS_ALLOW_ORIGIN: string;
	HELIUS_API_KEY: string;
	HELIUS_WS_URL: string;
	HELIUS_BASE_URL: string;
}

export default {
	async fetch(request: Request, env: Env) {

		// If the request is an OPTIONS request, return a 200 response with permissive CORS headers
		// This is required for the Helius RPC Proxy to work from the browser and arbitrary origins
		// If you wish to restrict the origins that can access your Helius RPC Proxy, you can do so by
		// changing the `*` in the `Access-Control-Allow-Origin` header to a specific origin.
		// For example, if you wanted to allow requests from `https://example.com`, you would change the
		// header to `https://example.com`. Multiple domains are supported by verifying that the request
		// originated from one of the domains in the `CORS_ALLOW_ORIGIN` environment variable.
		const supportedDomains = env.CORS_ALLOW_ORIGIN ? env.CORS_ALLOW_ORIGIN.split(',') : undefined;
		const corsHeaders: Record<string, string> = {
			"Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
			"Access-Control-Allow-Headers": "*",
		}
		if (supportedDomains) {
			const origin = request.headers.get('Origin')
			if (origin && supportedDomains.includes(origin)) {
				corsHeaders['Access-Control-Allow-Origin'] = origin
			}
		} else {
			corsHeaders['Access-Control-Allow-Origin'] = '*'
		}

		// Handle OPTIONS request
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 200,
				headers: corsHeaders,
			});
		}

		// Handle WebSocket upgrade
		const upgradeHeader = request.headers.get('Upgrade')
		if (upgradeHeader || upgradeHeader === 'websocket') {
			return await fetch(`${env.HELIUS_WS_URL}?api-key=${env.HELIUS_API_KEY}`, request)
		}

		// Handle regular HTTP requests
		const { pathname, search } = new URL(request.url)
		const payload = await request.text();
		
		// Ensure we have a clean base URL without trailing slash
		const baseUrl = env.HELIUS_BASE_URL.endsWith('/') 
			? env.HELIUS_BASE_URL.slice(0, -1) 
			: env.HELIUS_BASE_URL;

		// Construct the URL, ensuring we don't double up on slashes
		const proxyUrl = pathname === '/' 
			? `${baseUrl}?api-key=${env.HELIUS_API_KEY}${search ? `&${search.slice(1)}` : ''}`
			: `${baseUrl}${pathname}?api-key=${env.HELIUS_API_KEY}${search ? `&${search.slice(1)}` : ''}`;
		
		const proxyRequest = new Request(proxyUrl, {
			method: request.method,
			body: payload || null,
			headers: {
				'Content-Type': 'application/json',
				'X-Helius-Cloudflare-Proxy': 'true',
			}
		});

		return await fetch(proxyRequest).then(res => {
			return new Response(res.body, {
				status: res.status,
				headers: corsHeaders
			});
		});
	},
};
