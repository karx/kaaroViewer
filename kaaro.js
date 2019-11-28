// switchCamera,

let video = {
  "data": [
    {
      "vidUrl": "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
    },
    {
      "vidUrl": "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
    },
    {
      "vidUrl": "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4"
    }

  ],
  "count": 3
};
const l = console.log;
let i = 0;



async function listenOnOpenChannelForUserInteractionOnDifferentPlatforms() {
  var ID = function () {
    // Math.random should be unique because of its seeding algorithm.
    // Convert it to base 36 (numbers + letters), and grab the first 9 characters
    // after the decimal.
    return (
      "_" +
      Math.random()
        .toString(36)
        .substr(2, 9)
    );
  };
  var client = new Paho.Client(
    "api.akriya.co.in",
    8083,
    `clientId-kaaro_Event_Canvas-1${ID}`
  );

  // set callback handlers
  client.onConnectionLost = onConnectionLost;
  client.onMessageArrived = onMessageArrived;

  // connect the client
  client.connect({ onSuccess: onConnect });

  // called when the client connects
  function onConnect() {
    // Once a connection has been made, make a subscription and send a message.
    console.log("onConnect");
    client.subscribe("kaaroEvent/dev2/screen1/input");
    client.subscribe("kaaroEvent/dev1/screen1/input");
    client.subscribe("kaaroEvent/dev2/screen1/cameraSwitch");
    client.subscribe("kaaroEvent/dev2/screen1/forceReStream");
    let message = new Paho.Message("Hello from Streaming canvas");
    message.destinationName = "kaaroEvent/dev2/screen1/streaming_canvas";
    client.send(message);
    document.getElementById('vidToShow').play();
    //Once connection to MQTT established, it is time to start streaming the canvas.
    //   startStreamingTheCanvas();
  }

  // called when the client loses its connection
  function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
      console.log("onConnectionLost:" + responseObject.errorMessage);
    }
  }

  // called when a message arrives
  function onMessageArrived(message) {
    console.log("onMessageArrived:" + message.payloadString);
    if (message.destinationName === 'kaaroEvent/dev2/screen1/cameraSwitch') {
      console.log('switching cam');
      switchCamera();
    } else if (message.destinationName === 'kaaroEvent/dev2/screen1/forceReStream') {
      console.log('Force Restream triggered');

      restartSlides();
    } else {
      nextSlide();
    }
    // showTextFeedbackToUserForContext(message.payloadString);
  }
}

async function nextSlide() {
  var elem = document.getElementById('vidToShow');
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.msRequestFullscreen) {
    elem.msRequestFullscreen();
  } else if (elem.mozRequestFullScreen) {
    elem.mozRequestFullScreen();
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  }
  
  document.getElementById('vidToShow').setAttribute("src", video.data[1].vidUrl);
  document.getElementById('vidToShow').play();
  setTimeout(() => {
    document.getElementById('vidToShow').setAttribute("src", video.data[0].vidUrl);
    document.getElementById('vidToShow').play();
  }, 4000);
}
async function restartSlides() {
  i = 0;
  nextSlide();
}

export {
  listenOnOpenChannelForUserInteractionOnDifferentPlatforms
};