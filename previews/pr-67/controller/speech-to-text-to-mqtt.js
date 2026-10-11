
let dev_id = '1111';
let list_of_tables = [];

document.getElementById('btn-click').onclick =  () => {
    dev_id = document.getElementById('connection_code').value;
    sendConformationToMobile(dev_id);
    console.log(`Device Id set to ${dev_id}`);
};
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
  }();
var client = new Paho.Client(
    "wss://api.akriya.co.in:8084/mqtt",
    `clientId-thmap-controller-${ID}`
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
    client.subscribe("thoughtmap/controller/master");
    client.subscribe(`thoughtmap/${ID}/connection_ack`);
    let message = new Paho.Message("Hello");
    message.destinationName = "thoughtmap/controller/presence";
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
    if (message.topic === `thoughtmap/${dev_id}/requested`) {
        console.log('One of our tables');
        perform_vibration(1);
        notify_table_ui(dev_id);
    } else if (message.topic === `thoughtmap/${ID}/connection_ack`) {
        add_to_list_of_tables(dev_id);
        device_live_ui_notify();
    }
}

function sendConformationToMobile(message_in) {
    let message = new Paho.Message(ID);
    message.destinationName = `thoughtmap/${message_in}/connected`;
    // client.subscribe(`thoughtmap/${message_in}/connected`);
    client.subscribe(`thoughtmap/${message_in}/requested`);
    client.send(message);
}


function sendPhrase(msg) {
    let message = new Paho.Message(msg);
    message.destinationName = `thoughtmap/${dev_id}/phrase`;
    client.send(message);
}

function parseAndActOnText(txt) {
    if (txt.length > 0) {
        console.log(txt);
        console.log(txt.length);
        sendPhrase(txt);
    }
   
}

function device_live_ui_notify() {
    document.getElementById('connection_code').style.backgroundColor ='#FF0000';
}

function device_live_end_ui_notify() {
    document.getElementById('connection_code').style.backgroundColor ='#00FF00';
}

function device_live_error_ui_notify() {
    document.getElementById('connection_code').style.backgroundColor ='#FF00FF';
}

function add_to_list_of_tables(device_id) {
    if (list_of_tables.indexOf(device_id) < 0) {
        console.log(`adding table ${device_id}`);
        list_of_tables.push(device_id);
        let el = document.createElement('div');
        el.className = 'each-table';
        el.id = device_id;
        el.innerHTML = device_id;
        el.style.backgroundColor = `#3E${device_id}`;
        document.getElementById('all-tables').appendChild(el);
    } else {
        console.log('looks like table already subbed');
    }
    
}

function perform_vibration(type = 1) {
    try {
        if (type == 0) {
            window.navigator.vibrate(300);
        } else if (type == 1) {
            window.navigator.vibrate([200, 100, 200, 100, 200]);
        } else if (type == 2) {
            window.navigator.vibrate([20]);
        }
    } catch (error) {
        console.log(error); 
    }
   
}
function notify_table_ui(device_id) {
    document.getElementById(device_id).classList = 'each-table live';
    setTimeout(() => {
        notify_table_ui_power_down(device_id);
    }, 1200);
}

function notify_table_ui_power_down(device_id) {
    document.getElementById(device_id).classList = 'each-table';
}


var SpeechRecognition = SpeechRecognition || webkitSpeechRecognition
var SpeechRecognitionEvent = SpeechRecognitionEvent || webkitSpeechRecognitionEvent
var SpeechGrammarList = SpeechGrammarList || webkitSpeechGrammarList

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
    recognition.continuous = true;
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    // recognition.maxAlternatives = 1;
    recognition.start();

    recognition.onresult = function (event) {
        let value_to_send = '';
        for (var i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                value_to_send += event.results[i][0].transcript;
            }
          }
        parseAndActOnText(value_to_send);
    }

    recognition.onaudiostart = (event) => {
        console.log("Mic is On");
        document.getElementById('connection_code').style.backgroundColor ='#FF0000';

    }

    recognition.onend = (event) => {
        console.log("Ended");
        document.getElementById('connection_code').style.backgroundColor ='#00FF00';

        setTimeout(() => {
            recognition.start();
        },1000);
    }

    recognition.error = (event) => {
        console.log("Ended", event);
        document.getElementById('connection_code').style.backgroundColor ='#FF00FF';
    }

    
}

listenForAllTheThingsTheUserSaysMostlyEntities();
