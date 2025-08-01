import express from 'express';
import cors from 'cors';
import { request as undiciRequest } from 'undici';

function parseProxyParameters(proxyRequest) {
  const params = {};
  const rawUrl = proxyRequest.url;
  const urlIndex = rawUrl.indexOf('url=');
  if (urlIndex !== -1) {
    const encodedUrl = rawUrl.substring(urlIndex + 4);
    params.url = decodeURIComponent(encodedUrl);
  }
  return params;
}

const app = express();
app.use(cors());
app.options('/*', cors());

app.set('json spaces', 2);

app.all('/*', async (req, res) => {
  try {
    const proxyParams = parseProxyParameters(req);
    if (!proxyParams.url) {
      return res.status(400).json({
        "title": "CORS Proxy Error - Required parameter is missing",
        "detail": "The parameter: url was not provided",
      });
    }

    const upstream = await undiciRequest(proxyParams.url, {
      method: req.method,
      headers: req.headers,
    });

    const contentType = upstream.headers['content-type'] || '';
    if (contentType.includes('application/vnd.apple.mpegurl') || proxyParams.url.includes('.m3u8')) {
      let body = '';
      for await (const chunk of upstream.body) {
        body += chunk;
      }

      const base = proxyParams.url.substring(0, proxyParams.url.lastIndexOf('/'));
      const rewritten = body.replace(/^(?!#)([^?#\s]+?\.(m3u8|ts|key))([^\s]*)?/gmi, (match) => {
        const url = match.trim();
        let fullUrl;
        if (url.includes('://')) {
          fullUrl = url;
        } else if (url.startsWith('/')) {
          const originUrl = new URL(proxyParams.url);
          fullUrl = originUrl.origin + url;
        } else {
          fullUrl = base + '/' + url;
        }
        return `${req.protocol}://${req.get('host')}${req.path}?url=${fullUrl}`;
      });

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.end(rewritten);
    }

    res.writeHead(upstream.statusCode, upstream.headers);
    upstream.body.pipe(res);

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      "title": "CORS Proxy Error - Internal server error",
      "detail": err.message,
    });
  }
});

export default app;
