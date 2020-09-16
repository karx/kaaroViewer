
import { entityMatch } from "./entity_matching.mjs";
import { getEntityImages } from "./fetch_knowledge.mjs";
import { pushImagesToViewer, pushEntityToViewer, jumpToAHeight, entityInGraphCheck } from './2viewr_functions.mjs';
import { showMicAtLevel, showSessionEnd, showSessionError, switchCamera } from './gviewr_functions.mjs';
import { updateChartWithStrings, getFocusWord } from './context_wordmap.mjs';
import { getEntityByte } from "./fetch_knowledge.mjs";

async function sendSampleText() {
  parseAndActOnText("random");
  parseAndActOnText("to started of this basic");
  parseAndActOnText("wd:Q60068");
  parseAndActOnText("wd:Q1058");
  parseAndActOnText("wd:Q668");
  parseAndActOnText("wd:Q2");

  updateChartWithStrings(["Getting started is 50% of the job done"], "started");
  
}

async function sampleForKaaroDemo() {
  parseAndActOnText("wd:Q9570");
  parseAndActOnText("wd:Q112343");

  updateChartWithStrings(["Demo data is pushed","Kaaro demo data", "data is important", " All data is valuable"], "data");
  
}

async function logTextToCurrentSessionViewer(text) {
  let el = document.createElement("div");
  el.classList.add('log-string')
  el.innerHTML = text;
  document.getElementById("logger").append(el);
}

async function parseAndActOnText(text) {
  let isWikidataEntity = text.startsWith('wd:'); //bool
  let quid_list;
  if(  isWikidataEntity== true) {
    quid_list = [text.split(':')[1]];
  } else {
    //Step 1: Send text to current session logger
    logTextToCurrentSessionViewer(text);
      
    // Step 2: Remove stop words and push for word-map generator
    updateChartWithStrings([text]);

    quid_list = await entityMatch(text);

  }
  

  //Step 3: Look for entities for 3d viewer and send to viewer
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

document.addEventListener(
  "DOMContentLoaded",
  function() {
    // pushThePlayButton();
    setTimeout(sendSampleText, 400);
  },
  false
);

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
    // switchCamera();
  }
  if (event.key === '|') {
    sampleForKaaroDemo();
  }
  // console.log(event);
});

document.getElementById('init-btn').addEventListener('click', (e) => {beginTheThing();});