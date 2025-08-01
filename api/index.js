import express from 'express';
import cors from 'cors';
import { request as undiciRequest } from 'undici';

function parseProxyParameters(proxyRequest) {
  const params = {};
  const rawUrl = proxyRequest.url; // e.g. /?url=https%3A%2F%2Fsony...%3Fauth%3Dabc&other=xyz
  const urlIndex = rawUrl.indexOf('url=');

  if (urlIndex !== -1) {
    const encodedUrl = rawUrl.substring(urlIndex + 4); // everything after 'url='
    params.url = decodeURIComponent(encodedUrl); // decode safely
  }

  return params;
}


const app = express();
app.use(cors());
app.options('/*', cors()); // handle preflight
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

    // Remove headers that break upstream HTTPS
    const headers = { ...req.headers };
    delete headers['host'];

   
    delete headers['content-length'];

    const upstream = await undiciRequest(proxyParams.url, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined
    });

   // res.writeHead(upstream.statusCode, Object.fromEntries(upstream.headers));
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
