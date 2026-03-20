const { createProxyMiddleware } = require('http-proxy-middleware');

const proxyOptions = { target: 'http://localhost:3001', changeOrigin: true, ws: true };
module.exports = function (app) {
  app.use('/socket.io', createProxyMiddleware(proxyOptions));
  app.use('/api', createProxyMiddleware(proxyOptions));
};
