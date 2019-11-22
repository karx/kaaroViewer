    // switchCamera,
  
let slides = {
    "data": [
        {
            "imgUrl":"https://akriya.co.in/assets/images/kaaroEvents/1.png"
        },
        {
            "imgUrl":"https://akriya.co.in/assets/images/kaaroEvents/2.png"
        },
        {
            "imgUrl":"https://akriya.co.in/assets/images/kaaroEvents/3.png"
        },
        {
            "imgUrl":"https://akriya.co.in/assets/images/kaaroEvents/4.png"
        },
        {
            "imgUrl":"https://akriya.co.in/assets/images/kaaroEvents/5.png"
        },
        {
            "imgUrl":"https://akriya.co.in/assets/images/kaaroEvents/6.png"
        }

    ],
    "count":6
};
const l = console.log;
let i = 0;


import {
    pushImagesToViewer,
    jumpToAHeight,
    entityInGraphCheck,
    showTextFeedbackToUserForContext,
    switchCamera
  } from "./gviewr_functions.js";

async function listenOnOpenChannelForUserInteractionOnDifferentPlatforms() {
    var ID = function() {
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
      "wss://api.akriya.co.in:8084/mqtt",
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
      client.subscribe("kaaroEvent/dev1/screen1/input");
      client.subscribe("kaaroEvent/dev1/screen1/cameraSwitch");
      client.subscribe("kaaroEvent/dev1/screen1/forceReStream");
      let message = new Paho.Message("Hello from Streaming canvas");
      message.destinationName = "kaaroEvent/dev1/screen1/streaming_canvas";
      client.send(message);
  
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
      if (message.destinationName === 'kaaroEvent/dev1/screen1/cameraSwitch') {
          console.log('switching cam');
          switchCamera();
      } else if(message.destinationName === 'kaaroEvent/dev1/screen1/forceReStream') {
        console.log('Force Restream triggered');
        
            restartSlides();
      } else {
          nextSlide();
      }
      showTextFeedbackToUserForContext(message.payloadString);
    }
  }

  async function nextSlide() {
      l(`src: url(${slides.data[i%slides.count].imgUrl})`);

    //   pushImagesToViewer([slides.data[i%slides.count].imgUrl], i);
      document.getElementById('slidePage').setAttribute("material", `src: url(${slides.data[i%slides.count].imgUrl})`);
      i++;
  }
  async function restartSlides() {
      i = 0;
      nextSlide();
  }

export {
    listenOnOpenChannelForUserInteractionOnDifferentPlatforms
};