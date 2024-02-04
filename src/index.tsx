import { addPlugin } from 'react-native-flipper';

let conectionEvent = null;
const pendingResponse = [];
let mockResponses = {};
let breakPointMock = '';
let configSet = {};
let customEventsCb =()=>{}

addPlugin({
  getId() {
    return 'rn-network-mock';
  },
  onConnect(connection) {
    conectionEvent = connection;
    console.log("I'm connected!");
    while (pendingResponse.length) {
      conectionEvent.send('updateResponse', pendingResponse.shift());
    }
    connection.send('onPingApi', { data: 'sss' });

    connection.receive('onPingApi', (newData) => {
      mockResponses = newData;
    });
    connection.receive('breakPointApi', (newData) => {
      breakPointMock = newData.inputValue;
    });
    connection.receive('configSet', (newData) => {
      configSet = newData?.configSet ?? {};
    });
    
  conectionEvent?.receive('customEvents', (newData) => {
    customEventsCb(newData);
      });
  },
  onDisconnect() {
    console.log("I'm disconnected!");
  },
  runInBackground() {
    return true;
  },
});
const findMatchingRequests = (url, method) => {
  try {
    const matches = [];
    if (mockResponses?.requests) {
      for (const request of mockResponses?.requests) {
        if (request?.url === url && request?.method === method && request?.__mock_status__) {
          matches.push(request);
        }
      }
    }

    return matches;
  } catch (error) {
    return null
  }
};

const pendingResponses = [];

const originalXML = window.XMLHttpRequest;
export function setupInterceptors() {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const xhr = this;
    let originalOnReadyStateChange:any = xhr.onloadend;

    xhr.onloadend = function () {
      if (xhr.readyState === 4) {
        const responseConfig = pendingResponses.shift() || {};
        responseConfig.config = { url: xhr._url };
       
          let mockconfig = {
            url: xhr.responseURL,
            response: xhr?._response && JSON.parse(xhr._response),
            status: xhr.status,
            method: xhr._method,
          };
          if (conectionEvent) {
            conectionEvent.send('updateResponse', mockconfig);
            pendingResponses.push(responseConfig);
          }
          if (breakPointMock == mockconfig.url) {
            conectionEvent.send('breakPointApiDetails', mockconfig);
            conectionEvent.receive('breakPointResolveApi', (data) => {
              xhr.responseURL = data.inputValue.url;
              xhr._response = JSON.stringify(data.inputValue.response);
              xhr.status = data.inputValue.status;
              xhr._method = data.inputValue.method;
              if(originalOnReadyStateChange){
                originalOnReadyStateChange.apply(this, arguments);

              }
              // resolve({...res, data});
            });
          } else if (originalOnReadyStateChange) {
            originalOnReadyStateChange.apply(this, arguments);
          }
        
      }
    };

    originalSend.apply(this, arguments);
  };
}

function MockXMLHttpRequest() {
  this.method = null;
  this.url = null;
  this.headers = {};
  this.onloadend = null;

  this.open = function (method, url) {
    this.method = method;
    this.url = url;
  };

  this.setRequestHeader = function (key, value) {
    this.headers[key] = value;
  };

  this.send = function (params) {
    let result = findMatchingRequests(this?.url, this?.method);
    const temp = result?.[0]?.responseVariations[result?.[0]?.variant];
    if (result?.length) {
      this.status = temp.status;
      this.responseText = temp.body;
      if (this.onloadend) {
        this.onloadend();
        conectionEvent?.send?.('LinkEventRequest', {url:this?.url, method:this?.method});
      }
    } else { 
      // window.XMLHttpRequest = originalXML;
      setTimeout(() => {
        var xhr = new originalXML();
        xhr.open(this.method, this.url, true);
        for (var key in this.headers) {
          xhr.setRequestHeader(key, this.headers[key]);
        }
        xhr.onloadend = function () {
          this.status = xhr.status;
          this.responseText = xhr._response;
          if (this.onloadend) {
            this.onloadend();
          }
        }.bind(this);
        xhr.onload = function () {
          this.status = xhr.status;
          this.responseText = xhr._response;
          if (this.onload ) {
            this.onload();
          }
        }.bind(this);
        xhr.onreadystatechange = function () {
          this.status = xhr.status;
          this.responseText = xhr._response;
          if (this.onreadystatechange) {
            this.onreadystatechange();
          }
        }.bind(this);
        xhr.send(params);
      }, 0);

    }
  };
}
setupInterceptors();
window.XMLHttpRequest = MockXMLHttpRequest;



export const onEventCallback = (cb)=>{
  customEventsCb =  cb
}
export default {onEventCallback}