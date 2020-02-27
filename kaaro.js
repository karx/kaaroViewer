var g_height = 0;
let entities_captured = {};
let entities_height = {};

async function entityMatch(
  query = "John Trivolta's performace in Pulp fiction was jazzy"
) {
  let headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36"
  };
  console.log("init");
  console.log(query);
  if (!query || query.length < 3) {
    return [];
  }
  const wikiEntityLikingResponse = await fetch(
    `https://cors-anywhere.herokuapp.com/https://opentapioca.org/api/annotate?query=${encodeURI(
      query
    )}`,
    {
      method: "GET",
      mode: "cors",
      headers: headers
    }
  );
  console.log(wikiEntityLikingResponse);
  let wikiEntityLiking;
  try {
    wikiEntityLiking = await wikiEntityLikingResponse.json();
  } catch (error) {
    console.log(error);
    return [];
  }
  console.log(wikiEntityLiking);
  let qid_list = wikiEntityLiking.annotations.map(
    each_match => each_match.best_qid
  );
  quid_list = qid_list.filter(quid => !!quid);
  console.log(qid_list);
  return qid_list;
  // return ['Q712548', 'Q9570'];
}

async function getEntityImages(QID) {
  let primaryImages = await _getEntityPrimaryImages(QID);
  let linkedImages = await _getEntitySecondaryImages(QID);

  console.log("primaryImages", primaryImages);
  console.log("linkedImages", linkedImages);

  let mixed_list = [...primaryImages, ...linkedImages];
  let array_of_imags = mixed_list.map(data => data.url);
  array_of_imags = array_of_imags.map(imgURL =>
    imgURL.replace("http://", "https://")
  );
  array_of_imags = array_of_imags.filter(imgURL => !imgURL.includes(".svg"));
  return array_of_imags;
}

async function _getEntityPrimaryImages(QID) {
  let headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
    Accept: "application/sparql-results+json"
  };
  const SPARQL = `
      SELECT ?img
      WHERE 
      {
        wd:${QID} wdt:P18 ?image
      
        BIND(REPLACE(wikibase:decodeUri(STR(?image)), "http://commons.wikimedia.org/wiki/Special:FilePath/", "") as ?fileName) .
        BIND(REPLACE(?fileName, " ", "_") as ?safeFileName)
        BIND(MD5(?safeFileName) as ?fileNameMD5) .
        BIND(CONCAT("https://upload.wikimedia.org/wikipedia/commons/thumb/", SUBSTR(?fileNameMD5, 1, 1), "/", SUBSTR(?fileNameMD5, 1, 2), "/", ?safeFileName, "/650px-", ?safeFileName) as ?img)
    
      }
    `;
  const primaryImagesResponse = await fetch(
    `https://query.wikidata.org/sparql?query=${SPARQL}&format=json`,
    {
      method: "GET",
      headers: headers,
      qs: { format: "json" }
    }
  );
  const primaryImages = await primaryImagesResponse.json();
  console.log("primaryImages", primaryImages);

  if (
    primaryImages &&
    primaryImages.results &&
    primaryImages.results.bindings
  ) {
    console.log(primaryImages.results.bindings);
    return primaryImages.results.bindings.map(data => {
      return { url: data.img.value };
    });
  }
  return null;
}

async function _getEntitySecondaryImages(QID) {
  let headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
    Accept: "application/sparql-results+json"
  };
  const SPARQL = `
    SELECT ?itemLevel2Label ?prop ?imgLvl2
    WHERE 
    {
        wd:${QID} ?prop ?itemLevel2.
        ?itemLevel2 wdt:P18 ?image.
        BIND(REPLACE(wikibase:decodeUri(STR(?image)), "http://commons.wikimedia.org/wiki/Special:FilePath/", "") as ?fileName) .
        BIND(REPLACE(?fileName, " ", "_") as ?safeFileName)
        BIND(MD5(?safeFileName) as ?fileNameMD5) .
        BIND(CONCAT("https://upload.wikimedia.org/wikipedia/commons/thumb/", SUBSTR(?fileNameMD5, 1, 1), "/", SUBSTR(?fileNameMD5, 1, 2), "/", ?safeFileName, "/650px-", ?safeFileName) as ?imgLvl2)
      
      SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
    }
    `;
  const secondaryImagesResponse = await fetch(
    `https://query.wikidata.org/sparql?query=${SPARQL}`,
    {
      method: "GET",
      headers: headers,
      qs: { format: "json" },
      json: true
    }
  );
  const secondaryImages = await secondaryImagesResponse.json();
  console.log("secondaryImages", secondaryImages);
  return secondaryImages.results.bindings.map(data => {
    return {
      url: data.imgLvl2.value,
      prop: data.prop,
      value: data.itemLevel2Label.value
    };
  });
}

async function pushImagesToViewer(array_of_imags) {
  let nodes_to_append = [];
  array_of_imags.forEach((image, i) => {
    let entityEl = document.createElement("a-box");

    console.log(image);
    console.log(i);

    const r = 4 + array_of_imags.length / 10; //radius of the scene
    const angle = ((2 * Math.PI) / array_of_imags.length) * i;
    entityEl.setAttribute(
      "position",
      `${r * Math.sin(angle)} ${g_height} ${r * Math.cos(angle)}`
    );
    entityEl.setAttribute("width", "2");
    entityEl.setAttribute("depth", "0.2");
    entityEl.setAttribute("height", "2");
    // entityEl.setAttribute('color','');
    entityEl.setAttribute("static-body", "true");
    entityEl.setAttribute("look-at", "#camera");
    entityEl.setAttribute("material", `src: url(${image})`);
    nodes_to_append.push(entityEl);
  });
  document.getElementById("theScene").append(...nodes_to_append);
  g_height += 2;
  document
    .getElementById("rig")
    .setAttribute("position", `0 ${1.6 + g_height} 0`);
}

async function jumpToAHeight(height) {
  document
    .getElementById("rig")
    .setAttribute("position", `0 ${1.6 + height} 0`);
}

async function logTextToCurrentSessionViewer(text) {
  let el = document.createElement("p");
  el.innerHTML = text;
  document.getElementById("logger").append(el);
}

async function parseAndActOnText(text) {
  //Step 1: Send text to current session logger
  logTextToCurrentSessionViewer(text);
  updateChartWithStrings([text]);
  // Step 2: Remove stop words and push for word-map generator

  //Step 3: Look for entities for 3d viewer and send to viewer
  let quid_list = await entityMatch(text);
  quid_list.forEach(async quid => {
    if (quid) {
      if (entities_captured[quid]) {
        jumpToAHeight(entities_height[quid]);
      } else {
        entities_captured[quid] = true;
        entities_height[quid] = g_height;
        let images_from_wiki = await getEntityImages(quid);
        pushImagesToViewer(images_from_wiki);
      }
    }
  });
}
document.addEventListener(
  "DOMContentLoaded",
  function() {
    // pushThePlayButton();
    setTimeout(test, 2600);
  },
  false
);

async function test() {
  // updateChartWithStrings(['Getting started is 50% of the job done'], 'started');
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
async function listenForAllTheThingsTheUserSaysMostlyEntities() {
  // var colors = [ 'aqua' , 'azure' , 'beige', 'bisque', 'black', 'blue', 'brown', 'chocolate', 'coral' ... ];
  // var grammar = '#JSGF V1.0; grammar colors; public <color> = ' + colors.join(' | ') + ' ;'
  var recognizing;
  var recognition = new SpeechRecognition();
  // reset();
  // recognition.onend = reset;

  // var speechRecognitionList = new SpeechGrammarList();
  // speechRecognitionList.addFromString(grammar, 1);

  // recognition.grammars = speechRecognitionList;
  // recognition.continuous = true;
  // recognition.lang = 'en-US';
  recognition.interimResults = true;
  // recognition.maxAlternatives = 1;
  recognition.start();

  recognition.onresult = function(event) {
    let value_to_send = "";
    for (var i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        value_to_send += event.results[i][0].transcript;
      }
    }
  };
}
function showMicEntityToMarkInput() {
  let el = document.createElement("a-entity");
  el.setAttribute("gltf-model", "#mic-asset");
  el.setAttribute("position", `2 ${g_height} -2`);
  // <a-entity gltf-model="#type-person-boy" position="2 2 -2" static-body></a-entity>
  document.getElementById("theMic").setAttribute("gltf-model", "#mic-asset");
}
// listenForAllTheThingsTheUserSaysMostlyEntities();
parseAndActOnText("random");
parseAndActOnText("text");
parseAndActOnText("to started of this basic");
parseAndActOnText("setup i call setup");

google.charts.load("current", { packages: ["wordtree"] });
google.charts.setOnLoadCallback(initChart);

var globalChartHandle;
var options = {
  wordtree: {
    format: "implicit",
    word: "started",
    type: "double"
  }
};
var g_phrases_array = ["Let's get started shall we"];

function initChart() {
  var data = google.visualization.arrayToDataTable([
    ["Phrases"],
    ["We are now live, time to get started"]
  ]);

  var chart = new google.visualization.WordTree(
    document.getElementById("wordtree_basic")
  );
  globalChartHandle = chart;
  chart.draw(data, options);
}

async function getFocusWord(phrase) {
  var words = phrase.split(" ");
  return words[Math.floor(words.length / 2)]; // middle word
}

async function updateChartWithStrings(phrase_array, focusWord = "not_set") {
  if (phrase_array && phrase_array.length > 0 && g_phrases_array && g_phrases_array.length > 0) {
    console.log(`changing data of the graph`);
    let chart = globalChartHandle;
    let data_array = [["Phrases"]];
    g_phrases_array = [...g_phrases_array, ...phrase_array];
    if (focusWord === "not_set") {
      focusWord = await getFocusWord(phrase_array[0]);
    }
    options.wordtree.word = focusWord;

    g_phrases_array.forEach(str => {
      data_array.push([str]);
    });

    console.log(data_array);
    var data = google.visualization.arrayToDataTable(data_array);
    chart.draw(data, options);
  } else {
    console.log("empty sent to Chart With String");
  }
}

document.addEventListener(
  "DOMContentLoaded",
  function() {
    // pushThePlayButton();
    setTimeout(test, 2600);
  },
  false
);

async function test() {
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
  // console.log(event);
});