const { XMLHttpRequest } = require('xhr2');
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this.__url = url;
  return originalOpen.apply(this, [method, url, ...args]);
};
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function(body) {
  this.setRequestHeader('Authorization', 'Bearer fake-token');
  return originalSend.apply(this, [body]);
};

const xhr = new XMLHttpRequest();
xhr.open('POST', 'http://localhost:3000');
xhr.send();
