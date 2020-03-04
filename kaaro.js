
import { entityMatch } from "./entity_matching.mjs";
import { getEntityImages } from "./fetch_knowledge.mjs";
import { pushImagesToViewer, pushEntityToViewer, jumpToAHeight, entityInGraphCheck } from './gviewr_functions.mjs';
import { showMicAtLevel, showSessionEnd, showSessionError, switchCamera } from './gviewr_functions.mjs';
import { updateChartWithStrings, getFocusWord } from './context_wordmap.mjs';
import { getEntityByte } from "./fetch_knowledge.mjs";



async function logTextToCurrentSessionViewer(text) {
  let el = document.createElement("p");
  el.innerHTML = text;
  document.getElementById("logger").append(el);
}

async function parseAndActOnText(text) {
  //Step 1: Send text to current session logger
  logTextToCurrentSessionViewer(text);
  
  // Step 2: Remove stop words and push for word-map generator
  updateChartWithStrings([text]);

  //Step 3: Look for entities for 3d viewer and send to viewer
  let quid_list = await entityMatch(text);
  console.log('DEBUG | List of matched Entities', quid_list);
  quid_list.forEach(async quid => {
    
      if (entityInGraphCheck(quid)) {
        jumpToAHeight(quid);
      } else {
        // let images_from_wiki = await getEntityImages(quid);
        // pushImagesToViewer(images_from_wiki, quid);

        let entity_from_wiki = await getEntityByte(quid);
        pushEntityToViewer(entity_from_wiki, quid);
        console.log('Now in kaaro.js | This is what i got');
        console.log(entity_from_wiki);
      }

  });
}

var number = Math.floor(Math.random() * 8888) + 1111;

function beginTheThing() {
  init();
}

function init() {
  document.getElementById("connection_code").innerHTML = number;
  document
    .getElementById("connection_code")
    .setAttribute("aria-label", `Connection Code is ${number}`);
  let btn = document.getElementById("init-btn");
  // document.getElementById('buzzer_basic').style.backgroundColor = `#3E${number}`;
  // btn.style.display = "none";
}

// init();
function perform_vibration(type = 1) {
  try {
    if (type == 0) {
      window.navigator.vibrate(300);
    } else if (type == 1) {
      window.navigator.vibrate([200, 30, 200, 30, 200]);
    } else if (type == 2) {
      window.navigator.vibrate([20]);
    }
  } catch (error) {
    console.log(error);
  }
}

var ID = function() {
  return (
    "_" +
    Math.random()
      .toString(36)
      .substr(2, 9)
  );
};
var client = new Paho.Client(
  "wss://api.akriya.co.in:8084/mqtt",
  `clientId-thmap-Viz-${ID()}`
);

// var client = new Paho.Client(
//     "api.akriya.co.in",
//     8083,
//     `clientId-91springboard_${ID}`
//   );

// set callback handlers
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;

// connect the client
client.connect({ onSuccess: onConnect });

// called when the client connects
function onConnect() {
  // Once a connection has been made, make a subscription and send a message.
  console.log("onConnect");
  client.subscribe(`thoughtmap/${number}/connected`);
  client.subscribe(`thoughtmap/${number}/phrase`);
  let message = new Paho.Message("Hello");
  message.destinationName = `thoughtmap/${number}/presence`;
  client.send(message);
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
  console.log("The Topic:" + message.topic);

  if (message.topic === `thoughtmap/${number}/detected`) {
    perform_vibration(0);
  } else if (message.topic === `thoughtmap/${number}/connected`) {
    // show_options();
    show_connected_feedback();
    send_ack_connection(message.payloadString);
  } else if (message.topic === `thoughtmap/${number}/phrase`) {
    let phrase = message.payloadString;
    console.log("Parsing Text");
    parseAndActOnText(phrase);
  }

  console.log(message);
  console.log("onMessageArrived:" + message.payloadString);
}
function show_connected_feedback() {
  document.getElementById("connection_code").style.backgroundColor = "#00FF00";
  showMicEntityToMarkInput();
}
function send_ack_connection(ack_dev_id) {
  let message = new Paho.Message("ack");
  message.destinationName = `thoughtmap/${ack_dev_id}/connection_ack`;
  client.send(message);
}

function buzzer_click() {
  let message = new Paho.Message("ack");
  message.destinationName = `thoughtmap/${number}/requested`;
  client.send(message);
}

function showMicEntityToMarkInput() {
  let el = document.createElement("a-entity");
  el.setAttribute("gltf-model", "#mic-asset");
  el.setAttribute("position", `2 ${g_height} -2`);
  // <a-entity gltf-model="#type-person-boy" position="2 2 -2" static-body></a-entity>
  document.getElementById("theMic").setAttribute("gltf-model", "#mic-asset");
}
// listenForAllTheThingsTheUserSaysMostlyEntities();


document.addEventListener(
  "DOMContentLoaded",
  function() {
    // pushThePlayButton();
    setTimeout(sendSampleText, 2600);
  },
  false
);

async function sendSampleText() {
  parseAndActOnText("random");
  parseAndActOnText("Paris is not in Australia");
  parseAndActOnText("to started of this basic");

  updateChartWithStrings(["Getting started is 50% of the job done"], "started");
  
}

document.getElementById('secret-text-box').addEventListener('keydown', (event) => {
  if (event.isComposing || event.keyCode === 229) {
    return;
  }
  if (event.keyCode === 13) {
    let in_el = document.getElementById('secret-text-box');
    let text = in_el.value;
    in_el.value = '';
    console.log(text)
    parseAndActOnText(text);

  }

});

async function show_secret_input(toShow = true) {
  if (toShow) {
    document.getElementById('direct-input-box-id').style.visibility = 'visible';
  } else {
    document.getElementById('direct-input-box-id').style.visibility = 'hidden';
  }
}


document.addEventListener('keydown', (event) => {
  if (event.isComposing || event.keyCode === 229) {
    return;
  }
  if (event.key === 'G') {
    show_secret_input();
  }
  if (event.key === 'Z') {
    show_secret_input(false);
  }
  if (event.key === 'C') {
    switchCamera();
  }
  // console.log(event);
});